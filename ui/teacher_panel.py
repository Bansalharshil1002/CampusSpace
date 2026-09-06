"""Teacher panel: assign/revoke CRs and optional status override."""

from __future__ import annotations

import streamlit as st

from services.assignment_service import (
    assign_cr,
    list_active_cr_assignments,
    revoke_assignment,
)
from services.room_service import list_active_rooms
from services.status_service import (
    get_current_status,
    statuses_for_room_type,
    update_status,
)
from services.user_service import list_users_by_roles


def render_teacher_panel(user: dict) -> None:
    st.header("Teacher Panel")
    st.caption("Assign or revoke CRs and optionally override room status.")

    rooms = [
        r for r in list_active_rooms() if r["room_type"] in ("classroom", "lt")
    ]
    students = list_users_by_roles(["student", "cr"])

    st.subheader("Assign CR")
    if not rooms:
        st.warning("No classroom or LT rooms available.")
    elif not students:
        st.warning("No students available to assign.")
    else:
        room_labels = {f"{r['name']} ({r['room_type']})": r["id"] for r in rooms}
        student_labels = {f"{u['name']} ({u['role']})": u["id"] for u in students}
        with st.form("assign_cr_form"):
            room_label = st.selectbox("Room", list(room_labels.keys()))
            student_label = st.selectbox("Student", list(student_labels.keys()))
            submitted = st.form_submit_button("Assign as CR")
            if submitted:
                try:
                    assign_cr(
                        room_labels[room_label],
                        student_labels[student_label],
                        user["id"],
                    )
                    st.success(f"Assigned {student_label} as CR for {room_label}")
                    st.rerun()
                except ValueError as exc:
                    st.error(str(exc))

    st.subheader("Active CR Assignments")
    assignments = list_active_cr_assignments()
    if not assignments:
        st.info("No active CR assignments.")
    else:
        for a in assignments:
            cols = st.columns([3, 3, 1])
            cols[0].write(a["room_name"])
            cols[1].write(a["user_name"])
            if cols[2].button("Revoke", key=f"revoke_cr_{a['id']}"):
                try:
                    revoke_assignment(a["id"])
                    st.success("Assignment revoked.")
                    st.rerun()
                except ValueError as exc:
                    st.error(str(exc))

    st.subheader("Override Room Status")
    all_rooms = list_active_rooms()
    if not all_rooms:
        st.info("No rooms available.")
        return

    room_map = {f"{r['name']} ({r['room_type']})": r for r in all_rooms}
    selected = st.selectbox("Room to override", list(room_map.keys()), key="teacher_override_room")
    room = room_map[selected]
    current = get_current_status(room["id"])
    if current:
        st.write(f"Current: **{current['status']}**")

    statuses = list(statuses_for_room_type(room["room_type"]))
    with st.form("teacher_override_form"):
        new_status = st.selectbox("New Status", statuses)
        note = st.text_input("Note")
        if st.form_submit_button("Override Status"):
            try:
                update_status(
                    room["id"],
                    new_status,
                    note,
                    user,
                    allow_override=True,
                )
                st.success("Status overridden.")
                st.rerun()
            except (PermissionError, ValueError) as exc:
                st.error(str(exc))
