"""Test text hook: upper-cases the slot's text, and can be told to fail, to
grow to six lines, or to answer nothing."""
import sys

from folio_hook import fail, run, warn


def transform(request):
    """The text in capitals, following the test switches in it."""
    text = request.text
    if "FAIL" in text:
        fail("asked to fail")
    if "NOTEXT" in text:
        sys.exit(0)
    if "WARN" in text:
        warn("asked to warn", field="text")
    if "LONG" in text:
        return "\n".join([text.upper()] * 6)
    return text.upper()


if __name__ == "__main__":
    run(transform)
