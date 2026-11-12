"""Plain-language copy for every metric card.

Language rules (spec section 9): describe, do not grade. Reference ranges are population
ranges, not targets. Nothing here may use a phrase from banned.py; tests enforce that.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MetricCopy:
    title: str
    what: str  # what was measured
    below: str  # value sits below the typical range
    typical: str  # value sits within it
    above: str  # value sits above it
    unranged: str = ""  # shown when the value is not compared with a range
    signed: bool = False


REGIONS: tuple[tuple[str, str], ...] = (
    ("face", "Whole face"),
    ("eyes", "Eyes"),
    ("nose", "Nose"),
    ("lips", "Lips"),
    ("jaw", "Jaw and chin"),
    ("symmetry", "Symmetry"),
)

EXPERIMENTAL_NOTE = (
    "Experimental reading. It is estimated from a turned view through a 3D mesh that smooths the "
    "outline of the nose and chin, so it is shown without a reference range."
)

COPY: dict[str, MetricCopy] = {
    "face.thirds.middle_lower_ratio": MetricCopy(
        title="Middle to lower third",
        what="The height from your brow line to the base of your nose, divided by the height from "
        "the base of your nose to your chin.",
        below="Your lower third is the longer of the two. This is a common pattern, often with a longer jaw or chin.",
        typical="Your middle and lower thirds are close in height, as they are for most adults.",
        above="Your middle third is the longer of the two. This is a common pattern, often with a "
        "longer nose or a shorter chin.",
    ),
    "face.fifths.intercanthal_share": MetricCopy(
        title="Space between the eyes",
        what="The distance between the inner corners of your eyes as a share of the width of your "
        "face at the cheekbones.",
        below="The space between your eyes takes up a smaller share of your face width than is "
        "typical. Eyes that sit this way are often described as close-set.",
        typical="The space between your eyes takes up a typical share of your face width.",
        above="The space between your eyes takes up a larger share of your face width than is "
        "typical. Eyes that sit this way are often described as wide-set.",
    ),
    "face.fifths.eye_width_share": MetricCopy(
        title="Eye width",
        what="The average width of your eye openings, corner to corner, as a share of the width of "
        "your face at the cheekbones.",
        below="Your eye openings are narrower, relative to your face width, than is typical.",
        typical="Your eye openings take up a typical share of your face width.",
        above="Your eye openings are wider, relative to your face width, than is typical.",
    ),
    "face.width_height_ratio": MetricCopy(
        title="Face width to height",
        what="The width of your face at the cheekbones divided by its height from the bridge of "
        "your nose to your chin.",
        below="Your face is longer, relative to its width, than is typical.",
        typical="The width and height of your face are in a typical relationship.",
        above="Your face is wider, relative to its height, than is typical.",
    ),
    "eyes.canthal_tilt": MetricCopy(
        title="Canthal tilt",
        what="The angle of the line from the inner corner to the outer corner of each eye, averaged "
        "over both eyes. A positive value means the outer corner sits higher.",
        below="Your outer eye corners sit level with, or lower than, the inner corners by more than "
        "is typical. Tilt varies widely from person to person.",
        typical="Your outer eye corners sit slightly higher than the inner corners, which is the "
        "most common arrangement.",
        above="Your outer eye corners sit higher above the inner corners than is typical. Tilt "
        "varies widely from person to person.",
        signed=True,
    ),
    "eyes.spacing_ratio": MetricCopy(
        title="Eye spacing",
        what="The distance between the inner corners of your eyes divided by the average width of one eye opening.",
        below="The gap between your eyes is narrower, relative to the width of one eye, than is typical.",
        typical="The gap between your eyes is close to the width of one eye, which is typical.",
        above="The gap between your eyes is wider, relative to the width of one eye, than is typical.",
    ),
    "eyes.fissure_ratio": MetricCopy(
        title="Eye opening shape",
        what="The height of your eye opening divided by its width, averaged over both eyes. Higher "
        "values mean a rounder opening, lower values a more elongated one.",
        below="Your eye openings are more elongated than is typical. Squinting or bright light at "
        "capture lowers this reading.",
        typical="The shape of your eye openings is typical.",
        above="Your eye openings are rounder than is typical. Raised brows or widened eyes at "
        "capture raise this reading.",
    ),
    "nose.width_to_intercanthal": MetricCopy(
        title="Nose width to eye spacing",
        what="The width of your nose at the nostrils divided by the distance between the inner corners of your eyes.",
        below="Your nose is narrower, relative to the space between your eyes, than is typical.",
        typical="The width of your nose is close to the space between your eyes, which is typical.",
        above="Your nose is wider, relative to the space between your eyes, than is typical. This "
        "ratio varies a great deal between populations.",
    ),
    "nose.nasofrontal_angle": MetricCopy(
        title="Nasofrontal angle",
        what="The angle at the bridge of your nose between your brow and your nose tip, seen from "
        "the side. Smaller values mean a deeper bridge.",
        below="",
        typical="",
        above="",
        unranged=EXPERIMENTAL_NOTE,
    ),
    "nose.nasolabial_angle": MetricCopy(
        title="Nasolabial angle",
        what="The angle at the base of your nose between the underside of your nose and your upper "
        "lip, seen from the side.",
        below="",
        typical="",
        above="",
        unranged=EXPERIMENTAL_NOTE,
    ),
    "lips.upper_lower_ratio": MetricCopy(
        title="Upper to lower lip",
        what="The height of your upper lip divided by the height of your lower lip, measured at the "
        "centre of your mouth.",
        below="Your lower lip is fuller, relative to your upper lip, than is typical.",
        typical="Your lower lip is somewhat fuller than your upper lip, which is the most common arrangement.",
        above="Your upper and lower lips are closer in height than is typical.",
    ),
    "lips.mouth_to_nose_width": MetricCopy(
        title="Mouth width to nose width",
        what="The width of your mouth, corner to corner, divided by the width of your nose at the nostrils.",
        below="Your mouth is narrower, relative to your nose, than is typical.",
        typical="Your mouth is about one and a half times the width of your nose, which is typical.",
        above="Your mouth is wider, relative to your nose, than is typical.",
    ),
    "lips.philtrum_length": MetricCopy(
        title="Philtrum length",
        what="The distance from the base of your nose to the top edge of your upper lip, as a "
        "fraction of the distance between your pupils.",
        below="The space between your nose and upper lip is shorter than is typical.",
        typical="The space between your nose and upper lip is a typical length.",
        above="The space between your nose and upper lip is longer than is typical.",
    ),
    "jaw.gonial_angle": MetricCopy(
        title="Jaw angle",
        what="The angle at the corner of your jaw between the back edge of the jaw and its lower "
        "edge, seen from the side.",
        below="",
        typical="",
        above="",
        unranged=EXPERIMENTAL_NOTE,
    ),
    "jaw.bigonial_bizygomatic": MetricCopy(
        title="Jaw width to cheekbone width",
        what="The width of your jaw at its corners divided by the width of your face at the cheekbones.",
        below="Your jaw is narrower, relative to your cheekbones, than is typical, so your face "
        "tapers more toward the chin.",
        typical="Your jaw width and cheekbone width are in a typical relationship.",
        above="Your jaw is wider, relative to your cheekbones, than is typical, so your face tapers "
        "less toward the chin.",
    ),
    "jaw.chin_projection": MetricCopy(
        title="Chin projection",
        what="How far the front of your chin sits in front of or behind the base of your nose, seen "
        "from the side, as a fraction of the distance between your pupils. Negative means behind.",
        below="",
        typical="",
        above="",
        unranged=EXPERIMENTAL_NOTE,
        signed=True,
    ),
    "symmetry.overall": MetricCopy(
        title="Overall symmetry index",
        what="How closely the left and right halves of your face mirror each other across the "
        "midline. 1.000 would be an exact mirror image, which no real face is.",
        below="",
        typical="",
        above="",
        unranged="Every face has some left-right difference, and most measured asymmetry is normal. "
        "A slight head turn or uneven lighting at capture also lowers this reading.",
    ),
}

UNAVAILABLE_TITLES: dict[str, str] = {
    "face.thirds.upper": "Upper third",
    "eyes.upper_lid_exposure": "Upper-lid exposure",
}

LANDMARK_NAMES: dict[str, str] = {
    "glabella": "glabella",
    "nasion": "nasion",
    "pronasale": "pronasale",
    "columella": "columella",
    "subnasale": "subnasale",
    "labrale_superius": "labrale superius",
    "stomion_upper": "stomion",
    "stomion_lower": "stomion",
    "labrale_inferius": "labrale inferius",
    "pogonion": "pogonion",
    "menton": "menton",
    "exocanthion_r": "exocanthion",
    "exocanthion_l": "exocanthion",
    "endocanthion_r": "endocanthion",
    "endocanthion_l": "endocanthion",
    "lid_upper_r": "upper lid margin",
    "lid_upper_l": "upper lid margin",
    "lid_lower_r": "lower lid margin",
    "lid_lower_l": "lower lid margin",
    "cheilion_r": "cheilion",
    "cheilion_l": "cheilion",
    "zygion_r": "zygion",
    "zygion_l": "zygion",
    "zygion": "zygion",
    "gonion_r": "gonion",
    "gonion_l": "gonion",
    "gonion": "gonion",
    "alare_r": "alar base",
    "alare_l": "alar base",
}


def landmark_labels(names: tuple[str, ...]) -> list[str]:
    seen: list[str] = []
    for name in names:
        label = LANDMARK_NAMES.get(name, name.replace("_", " "))
        if label not in seen:
            seen.append(label)
    return seen


def format_value(value: float, unit: str, signed: bool = False) -> str:
    if unit == "deg":
        return f"{value:+.1f}°" if signed else f"{value:.1f}°"
    if unit == "share":
        return f"{value * 100:.1f}%"
    if unit == "ipd":
        return f"{value:+.2f} × IPD" if signed else f"{value:.2f} × IPD"
    if unit == "index":
        return f"{value:.3f}"
    return f"{value:.2f}"


def format_bound(value: float, unit: str) -> str:
    """A reference-range bound, without the unit suffix repeated on every number."""
    if unit == "deg":
        return f"{value:.0f}°"
    if unit == "share":
        return f"{value * 100:.0f}%"
    return f"{value:.2f}"
