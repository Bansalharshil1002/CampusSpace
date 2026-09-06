"""Dashboard: rooms grouped by building/floor with current status and history."""

from __future__ import annotations

import streamlit as st

from services.room_service import ROOM_TYPE_LABELS, rooms_grouped_by_building_floor
from services.status_service import (
    STATUS_INDICATORS,
    get_current_status,
    get_status_history,
    relative_time,
)


def _indicator(status: str | None) -> str:
    color = STATUS_INDICATORS.get(status or "", "gray")
    return {
        "green": "🟢",
        "red": "🔴",
        "yellow": "🟡",
        "blue": "🔵",
        "orange": "🟠",
        "gray": "⚪",
    }.get(color, "⚪")


def render_dashboard() -> None:
    st.header("Dashboard")
    st.caption("Current room statuses grouped by building and floor.")

    if st.button("Refresh"):
        st.rerun()

    grouped = rooms_grouped_by_building_floor()
    if not grouped:
        st.info("No active rooms found.")
        return

    for building, floors in grouped.items():
        st.subheader(building)
        for floor, rooms in floors.items():
            st.markdown(f"**Floor {floor}**")
            for room in rooms:
                current = get_current_status(room["id"])
                status = current["status"] if current else "Unknown"
                note = (current["note"] if current else None) or "—"
                updated = (
                    relative_time(current["created_at"]) if current else "never"
                )
                type_label = ROOM_TYPE_LABELS.get(room["room_type"], room["room_type"])

                with st.container(border=True):
                    st.markdown(
                        f"**{room['name']}** · {type_label}  \n"
                        f"{_indicator(status)} **{status}**  \n"
                        f"Note: {note}  \n"
                        f"Updated: {updated}"
                    )
                    with st.expander("Recent history"):
                        history = get_status_history(room["id"], limit=8)
                        if not history:
                            st.write("No history yet.")
                        else:
                            for entry in history:
                                who = entry.get("updated_by_name") or "Unknown"
                                note_text = entry.get("note") or "—"
                                st.write(
                                    f"- `{entry['created_at']}` — "
                                    f"**{entry['status']}** — {note_text} "
                                    f"(by {who})"
                                )
        st.divider()
