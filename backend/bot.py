import os
from datetime import datetime, timezone, timedelta

import aiohttp
from loguru import logger

from pipecat.adapters.llm.schemas.function_schema import FunctionSchema
from pipecat.adapters.llm.schemas.tools_schema import ToolsSchema
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.processors.frameworks.rtvi import RTVIObserver, RTVIProcessor
from pipecat.services.elevenlabs.stt import ElevenLabsSTTService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.services.google.llm import GoogleLLMService
from pipecat.services.llm_service import FunctionCallParams
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport

from store import store

IST = timezone(timedelta(hours=5, minutes=30))


def _build_system_prompt() -> str:
    today = datetime.now(IST).strftime("%Y-%m-%d (%A)")
    return (
        f"You are Maya, a warm and helpful clinic receptionist at CarePulse Clinic. Today is {today}. "
        "Keep every reply short and natural for voice: 1 to 2 sentences max. "
        "Never use markdown, bullet points, asterisks, or numbered lists in your speech. "
        "Your job is to help callers check doctor availability, book an appointment, or cancel an existing appointment. "
        "When offering available slots, mention only 2 or 3 slots at a time so it is easy to listen to. "
        "The caller is identified ONLY by the phone number they say out loud. "
        "CRITICAL RULE: Before calling book_appointment or cancel_appointment, you MUST read the caller's phone number back to them digit by digit (for example: 'nine eight seven, six five four, three two one zero') and ask them to confirm with a 'yes'. Only proceed after they confirm. "
        "You can handle checking availability, booking, and cancelling in the same conversation. "
        "If a slot is taken or no appointment is found for their number, explain kindly and offer the next best option."
    )


def _create_tools() -> ToolsSchema:
    check_availability_fn = FunctionSchema(
        name="check_doctor_availability",
        description="Check available appointment slots by optional doctor name, speciality, or date (YYYY-MM-DD).",
        properties={
            "doctor_name": {
                "type": "string",
                "description": "Doctor's name or partial name, e.g. 'Sarah Chen' or 'Mehta'.",
            },
            "speciality": {
                "type": "string",
                "description": "Medical speciality, e.g. 'Cardiology', 'Dermatology', 'Pediatrics', 'Orthopedics'.",
            },
            "date": {
                "type": "string",
                "description": "Optional date filter in YYYY-MM-DD format.",
            },
        },
        required=[],
    )

    book_appointment_fn = FunctionSchema(
        name="book_appointment",
        description="Book a specific doctor slot for the caller after they have confirmed their phone number digit by digit.",
        properties={
            "phone_number": {
                "type": "string",
                "description": "Caller's confirmed phone number (digits).",
            },
            "doctor_id": {
                "type": "string",
                "description": "The doctor_id returned by check_doctor_availability, e.g. 'doc_1'.",
            },
            "slot": {
                "type": "string",
                "description": "Exact slot string from check_doctor_availability, e.g. '2026-11-26 09:30 AM'.",
            },
        },
        required=["phone_number", "doctor_id", "slot"],
    )

    cancel_appointment_fn = FunctionSchema(
        name="cancel_appointment",
        description="Cancel the caller's existing booked appointment after they have confirmed their phone number digit by digit.",
        properties={
            "phone_number": {
                "type": "string",
                "description": "Caller's confirmed phone number (digits).",
            },
        },
        required=["phone_number"],
    )

    return ToolsSchema(
        standard_tools=[check_availability_fn, book_appointment_fn, cancel_appointment_fn]
    )


async def run_bot(webrtc_connection: SmallWebRTCConnection) -> None:
    """Create and run the Pipecat voice pipeline for one WebRTC caller."""
    elevenlabs_api_key = os.getenv("ELEVENLABS_API_KEY", "")
    google_api_key = os.getenv("GOOGLE_API_KEY", "")
    voice_id = os.getenv("ELEVENLABS_VOICE_ID") or "EXAVITQu4vr4xnSDxMaL"

    if not elevenlabs_api_key or not google_api_key:
        logger.error("Missing ELEVENLABS_API_KEY or GOOGLE_API_KEY in environment.")
        return

    transport = SmallWebRTCTransport(
        webrtc_connection=webrtc_connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
        ),
    )

    rtvi = RTVIProcessor(transport=transport)

    async with aiohttp.ClientSession() as session:
        stt = ElevenLabsSTTService(
            api_key=elevenlabs_api_key,
            aiohttp_session=session,
        )

        tts = ElevenLabsTTSService(
            api_key=elevenlabs_api_key,
            settings=ElevenLabsTTSService.Settings(voice=voice_id),
        )

        llm = GoogleLLMService(
            api_key=google_api_key,
            settings=GoogleLLMService.Settings(
                model="gemini-2.5-flash",
                system_instruction=_build_system_prompt(),
                temperature=0.4,
            ),
        )

        async def handle_check_availability(params: FunctionCallParams) -> None:
            args = params.arguments
            logger.info(f"Tool check_doctor_availability: {args}")
            result = store.check_doctor_availability(
                doctor_name=args.get("doctor_name"),
                speciality=args.get("speciality"),
                date=args.get("date"),
            )
            await params.result_callback(result)

        async def handle_book_appointment(params: FunctionCallParams) -> None:
            args = params.arguments
            logger.info(f"Tool book_appointment: {args}")
            result = store.book_appointment(
                phone_number=args.get("phone_number", ""),
                doctor_id=args.get("doctor_id", ""),
                slot=args.get("slot", ""),
            )
            if result.get("success") and hasattr(rtvi, "send_server_message"):
                try:
                    await rtvi.send_server_message(
                        {"type": "appointment_booked", "appointment": result["appointment"]}
                    )
                except Exception as exc:
                    logger.debug(f"Optional server message skipped: {exc}")
            await params.result_callback(result)

        async def handle_cancel_appointment(params: FunctionCallParams) -> None:
            args = params.arguments
            logger.info(f"Tool cancel_appointment: {args}")
            result = store.cancel_appointment(
                phone_number=args.get("phone_number", ""),
            )
            if result.get("success") and hasattr(rtvi, "send_server_message"):
                try:
                    await rtvi.send_server_message(
                        {"type": "appointment_cancelled", "appointment": result["appointment"]}
                    )
                except Exception as exc:
                    logger.debug(f"Optional server message skipped: {exc}")
            await params.result_callback(result)

        llm.register_function("check_doctor_availability", handle_check_availability)
        llm.register_function("book_appointment", handle_book_appointment)
        llm.register_function("cancel_appointment", handle_cancel_appointment)

        tools = _create_tools()
        context = LLMContext(
            messages=[
                {
                    "role": "user",
                    "content": "Greet the caller warmly as Maya from CarePulse Clinic and ask how you can help with their appointment today.",
                }
            ],
            tools=tools,
        )

        context_aggregator = LLMContextAggregatorPair(
            context,
            user_params=LLMUserAggregatorParams(
                vad_analyzer=SileroVADAnalyzer(),
            ),
        )

        pipeline = Pipeline(
            [
                transport.input(),
                rtvi,
                stt,
                context_aggregator.user(),
                llm,
                tts,
                transport.output(),
                context_aggregator.assistant(),
            ]
        )

        task = PipelineTask(
            pipeline,
            params=PipelineParams(
                allow_interruptions=True,
                enable_metrics=True,
            ),
            observers=[RTVIObserver(rtvi)],
        )

        @rtvi.event_handler("on_client_ready")
        async def on_client_ready(rtvi_proc):
            logger.info("RTVI client ready — starting greeting")
            await rtvi_proc.set_bot_ready()
            await task.queue_frames([LLMRunFrame()])

        @transport.event_handler("on_client_disconnected")
        async def on_client_disconnected(_transport, _client):
            logger.info("WebRTC client disconnected — cancelling pipeline task")
            await task.cancel()

        runner = PipelineRunner(handle_sigint=False)
        await runner.run(task)
