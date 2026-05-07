import unittest
from unittest import mock

from app.services.speech_runtime import EnginePlan, EngineAdapter, resolve_engine_order


class SpeechRuntimePolicyTest(unittest.TestCase):
    def test_preferred_engine_takes_priority(self) -> None:
        order = resolve_engine_order(preferred_engine="whisper-cpp", tier="high")
        self.assertEqual(order, ["whisper-cpp"])

    def test_high_tier_prefers_realtime_default_engine(self) -> None:
        order = resolve_engine_order(tier="high")
        self.assertEqual(order, ["sherpa-onnx", "whisper-cpp", "vosk"])

    def test_standard_tier_uses_vosk_as_secondary_fallback(self) -> None:
        order = resolve_engine_order(tier="standard")
        self.assertEqual(order, ["sherpa-onnx", "vosk", "whisper-cpp"])

    def test_low_tier_prefers_lightweight_engine_first(self) -> None:
        order = resolve_engine_order(tier="low")
        self.assertEqual(order, ["vosk", "sherpa-onnx", "whisper-cpp"])

    def test_native_command_available_when_template_and_binary_exist(self) -> None:
        plan = EnginePlan(id="whisper-cpp", label="", model="small", priority=1)
        adapter = EngineAdapter(plan)
        with mock.patch.dict(
            "os.environ",
            {"SPEECH_ENGINE_WHISPER_CPP_CMD": "whisper-cli -f {input}"},
            clear=False,
        ), mock.patch("shutil.which", return_value="/usr/local/bin/whisper-cli"):
            self.assertTrue(adapter.is_native_available())

    def test_native_only_unavailable_disables_fallback(self) -> None:
        plan = EnginePlan(id="whisper-cpp", label="", model="small", priority=1)
        adapter = EngineAdapter(plan)
        with mock.patch.dict(
            "os.environ",
            {
                "SPEECH_ENGINE_WHISPER_CPP_NATIVE_ONLY": "true",
                "SPEECH_ENGINE_WHISPER_CPP_CMD": "",
            },
            clear=False,
        ):
            self.assertFalse(adapter.is_available())


if __name__ == "__main__":
    unittest.main()
