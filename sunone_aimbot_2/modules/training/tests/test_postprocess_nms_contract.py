import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


class PostProcessNmsContractTest(unittest.TestCase):
    def read_postprocess(self):
        return (REPO_ROOT / "sunone_aimbot_2/detector/postProcess.cpp").read_text(
            encoding="utf-8"
        )

    def test_nms_is_class_aware(self):
        postprocess = self.read_postprocess()

        self.assertRegex(
            postprocess,
            r"classId\s*!=",
            "NMS should not suppress overlapping detections from different classes.",
        )

    def test_nms_uses_confidence_weighted_box_fusion(self):
        postprocess = self.read_postprocess()

        for token in (
            "weightedX",
            "weightedY",
            "weightedWidth",
            "weightedHeight",
            "weightSum",
        ):
            self.assertIn(
                token,
                postprocess,
                "NMS should fuse same-class overlapping boxes by confidence weight.",
            )

        self.assertRegex(
            postprocess,
            re.compile(r"result\.push_back\(\s*fusedDetection\s*\)", re.DOTALL),
        )


if __name__ == "__main__":
    unittest.main()
