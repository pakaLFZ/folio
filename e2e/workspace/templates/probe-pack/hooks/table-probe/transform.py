"""Test table hook: upper-cases every cell, and can be told to fail or to grow."""
from folio_hook import fail, run


def transform(request):
    """The table in capitals, following the test switches in its cells."""
    table = request.table
    cells = [c for row in table["rows"] for c in row]
    if "FAIL" in cells:
        fail("asked to fail")
    rows = [[c.upper() for c in row] for row in table["rows"]]
    if "GROW" in cells:
        rows += [[f"ROW {i}"] * len(table["columns"]) for i in range(10)]
    return {"columns": [c.upper() for c in table["columns"]], "rows": rows}


if __name__ == "__main__":
    run(transform)
