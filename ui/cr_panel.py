"""My Updates: CR / Society Rep status updates for assigned rooms."""

from __future__ import annotations

import streamlit as st

from services.assignment_service import list_active_assignments_for_user
from services.room_service import ROOM_TYPE_LABELS
from services.status_service import (
    get_current_status,
    relative_time,
    statuses_for_room_type,
    update_status,
)


def render_cr_panel(user: dict) -> None:
    st.header("My Updates")
    st.caption("Update status for rooms assigned to you.")

    assignments = list_active_assignments_for_user(user["id"])
    if not assignments:
        st.info("You have no active room assignments.")
        return

    for assignment in assignments:
        room_id = assignment["room_id"]
        room_name = assignment["room_name"]
        room_type = assignment["room_type"]
        type_label = ROOM_TYPE_LABELS.get(room_type, room_type)
        current = get_current_status(room_id)
        current_status = current["status"] if current else "Unknown"
        updated = relative_time(current["created_at"]) if current else "never"

        with st.container(border=True):
            st.subheader(room_name)
            st.write(f"Type: {type_label}")
            st.write(f"Current: **{current_status}**")
            st.write(f"Last updated: {updated}")

            statuses = list(statuses_for_room_type(room_type))
            with st.form(f"update_form_{room_id}"):
                new_status = st.selectbox("New Status", statuses, key=f"status_{room_id}")
                note = st.text_input("Note", key=f"note_{room_id}")
                submitted = st.form_submit_button("Update Status")
                if submitted:
                    try:
                        update_status(room_id, new_status, note, user)
                        st.success(f"Updated {room_name} to {new_status}")
                        st.rerun()
                    except (PermissionError, ValueError) as exc:
                        st.error(str(exc))
