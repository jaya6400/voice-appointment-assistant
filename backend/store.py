import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from threading import Lock
from typing import Optional

DATA_FILE = Path(__file__).parent / "data.json"
IST = timezone(timedelta(hours=5, minutes=30))


def _now_iso() -> str:
    return datetime.now(IST).isoformat(timespec="seconds")


def normalize_phone(phone: str) -> str:
    """Keep only digits so spoken phone numbers match consistently."""
    digits = re.sub(r"\D", "", phone or "")
    # If caller included country code like +91 or 1, keep last 10 digits when longer than 10
    if len(digits) > 10:
        digits = digits[-10:]
    return digits


def _split_slot(slot: str) -> tuple[str, str]:
    """Split 'YYYY-MM-DD HH:MM AM' into (date, time)."""
    parts = slot.strip().split(" ", 1)
    if len(parts) == 2:
        return parts[0], parts[1]
    return slot, ""


class AppointmentStore:
    """In-memory appointment & doctor store seeded from data.json."""

    def __init__(self, data_path: Path = DATA_FILE):
        self._lock = Lock()
        with open(data_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        self._doctors: list[dict] = raw.get("doctors", [])
        self._appointments: list[dict] = raw.get("appointments", [])
        self._next_id = 1004

    def get_doctors(self) -> list[dict]:
        with self._lock:
            return [
                {**doc, "slots": list(doc["slots"])}
                for doc in self._doctors
            ]

    def get_appointments(self) -> list[dict]:
        with self._lock:
            # Return newest first so live bookings appear at the top
            return list(reversed([dict(a) for a in self._appointments]))

    def get_stats(self) -> dict:
        with self._lock:
            total_doctors = len(self._doctors)
            available_slots = sum(len(d["slots"]) for d in self._doctors)
            booked_appointments = sum(
                1 for a in self._appointments if a["status"] == "booked"
            )
            cancelled_appointments = sum(
                1 for a in self._appointments if a["status"] == "cancelled"
            )
            return {
                "total_doctors": total_doctors,
                "available_slots": available_slots,
                "booked_appointments": booked_appointments,
                "cancelled_appointments": cancelled_appointments,
            }

    def check_doctor_availability(
        self,
        doctor_name: Optional[str] = None,
        speciality: Optional[str] = None,
        date: Optional[str] = None,
    ) -> dict:
        """Return matching doctors and their available slots."""
        with self._lock:
            name_q = (doctor_name or "").strip().lower()
            spec_q = (speciality or "").strip().lower()
            date_q = (date or "").strip().lower()

            results = []
            for doc in self._doctors:
                if name_q and name_q not in doc["name"].lower():
                    continue
                if spec_q and spec_q not in doc["speciality"].lower():
                    continue

                slots = [
                    s for s in doc["slots"]
                    if not date_q or s.lower().startswith(date_q)
                ]
                if slots:
                    results.append({
                        "doctor_id": doc["id"],
                        "doctor_name": doc["name"],
                        "speciality": doc["speciality"],
                        "available_slots": slots,
                    })

            if not results:
                return {
                    "found": False,
                    "message": "No available slots matched that search.",
                    "doctors": [],
                }
            return {
                "found": True,
                "doctors": results,
            }

    def book_appointment(
        self,
        phone_number: str,
        doctor_id: str,
        slot: str,
    ) -> dict:
        """Book an available slot for the caller's phone number."""
        norm_phone = normalize_phone(phone_number)
        if len(norm_phone) < 7:
            return {
                "success": False,
                "error": "Please provide a valid phone number with at least 7 digits.",
            }

        with self._lock:
            # Find doctor by id (or fallback by name if LLM passed name)
            doc = next(
                (
                    d for d in self._doctors
                    if d["id"].lower() == doctor_id.strip().lower()
                    or d["name"].lower() == doctor_id.strip().lower()
                ),
                None,
            )
            if not doc:
                return {
                    "success": False,
                    "error": f"Doctor '{doctor_id}' was not found.",
                }

            # Match slot case-insensitively
            matched_slot = next(
                (s for s in doc["slots"] if s.lower() == slot.strip().lower()),
                None,
            )
            if not matched_slot:
                return {
                    "success": False,
                    "error": f"Slot '{slot}' is not available for {doc['name']}.",
                    "available_slots": doc["slots"][:3],
                }

            doc["slots"].remove(matched_slot)
            date_str, time_str = _split_slot(matched_slot)
            apt = {
                "id": f"apt_{self._next_id}",
                "phone_number": norm_phone,
                "doctor_id": doc["id"],
                "doctor_name": doc["name"],
                "speciality": doc["speciality"],
                "date": date_str,
                "time": time_str,
                "slot": matched_slot,
                "status": "booked",
                "updated_at": _now_iso(),
            }
            self._next_id += 1
            self._appointments.append(apt)

            return {
                "success": True,
                "message": f"Booked {doc['name']} ({doc['speciality']}) on {matched_slot}.",
                "appointment": apt,
            }

    def cancel_appointment(self, phone_number: str) -> dict:
        """Cancel the most recent active booked appointment for a phone number."""
        norm_phone = normalize_phone(phone_number)
        if not norm_phone:
            return {
                "success": False,
                "error": "Please provide a phone number to look up the appointment.",
            }

        with self._lock:
            # Find latest active booked appointment for this phone number
            target = None
            for apt in reversed(self._appointments):
                if apt["phone_number"] == norm_phone and apt["status"] == "booked":
                    target = apt
                    break

            if not target:
                return {
                    "success": False,
                    "error": f"No active booked appointment found for phone number {norm_phone}.",
                }

            target["status"] = "cancelled"
            target["updated_at"] = _now_iso()

            # Restore the slot back to the doctor's available slots
            doc = next((d for d in self._doctors if d["id"] == target["doctor_id"]), None)
            if doc and target["slot"] not in doc["slots"]:
                doc["slots"].append(target["slot"])
                doc["slots"].sort()

            return {
                "success": True,
                "message": f"Cancelled appointment with {target['doctor_name']} on {target['slot']}.",
                "appointment": dict(target),
            }


store = AppointmentStore()
