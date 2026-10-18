"""Shared single-range parsing for immutable local media bytes."""


def parse_range(range_header: str, size: int) -> tuple[int, int, int]:
    """Return (status, start, end); ignore unsupported multi-range requests."""
    start, end = 0, size - 1
    status = 200
    if ',' in range_header:
        return status, start, end
    if range_header.startswith('bytes='):
        requested = range_header[6:].strip()
        left, right = requested.split('-', 1)
        if left:
            start = int(left)
            end = int(right) if right else size - 1
        else:
            suffix = int(right)
            start = max(0, size - suffix)
        if start < 0 or start >= size or end < start:
            raise ValueError('invalid byte range')
        end = min(end, size - 1)
        status = 206
    return status, start, end
