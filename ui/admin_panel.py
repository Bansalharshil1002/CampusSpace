"""Admin panel: rooms, users, assignments, overrides, history."""

from __future__ import annotations

import streamlit as st

from services.assignment_service import (
    assign_cr,
    assign_society_rep,
    list_all_active_assignments,
    revoke_assignment,
)
from services.room_service import (
    ROOM_TYPE_LABELS,
    VALID_ROOM_TYPES,
    activate_room,
    create_room,
    deactivate_room,
    list_all_rooms,
)
from services.status_service import (
    get_status_history,
    statuses_for_room_type,
    update_status,
)
from services.user_service import VALID_ROLES, change_role, list_users, list_users_by_roles


def render_admin_panel(user: dict) -> None:
    st.header("Admin Panel")
    st.caption("Manage rooms, users, assignments, and status overrides.")

    tab_rooms, tab_users, tab_assign, tab_status = st.tabs(
        ["Rooms", "Users", "Assignments", "Status / History"]
    )

    with tab_rooms:
        st.subheader("Create Room")
        with st.form("create_room_form"):
            name = st.text_input("Name")
            building = st.text_input("Building")
            floor = st.number_input("Floor", min_value=0, value=1, step=1)
            room_type = st.selectbox(
                "Room type",
                list(VALID_ROOM_TYPES),
                format_func=lambda t: ROOM_TYPE_LABELS.get(t, t),
            )
            if st.form_submit_button("Create"):
                try:
                    room_id = create_room(name, building, int(floor), room_type)
                    # Seed an initial status so dashboard is consistent
                    initial = (
                        "Open to all"
                        if room_type == "activity_space"
                        else "Free"
                    )
                    update_status(
                        room_id,
                        initial,
                        "Created by admin",
                        user,
                        allow_override=True,
                    )
                    st.success(f"Created {name}")
                    st.rerun()
                except ValueError as exc:
                    st.error(str(exc))

        st.subheader("All Rooms")
        for room in list_all_rooms():
            cols = st.columns([3, 2, 1, 1, 1])
            cols[0].write(room["name"])
            cols[1].write(ROOM_TYPE_LABELS.get(room["room_type"], room["room_type"]))
            cols[2].write(f"{room['building']} / F{room['floor']}")
            cols[3].write("Active" if room["active"] else "Inactive")
            if room["active"]:
                if cols[4].button("Deactivate", key=f"deact_{room['id']}"):
                    deactivate_room(room["id"])
                    st.rerun()
            else:
                if cols[4].button("Activate", key=f"act_{room['id']}"):
                    activate_room(room["id"])
                    st.rerun()

    with tab_users:
        st.subheader("Users")
        for u in list_users():
            cols = st.columns([3, 3, 2, 2])
            cols[0].write(u["name"])
            cols[1].write(u["email"])
            new_role = cols[2].selectbox(
                "Role",
                list(VALID_ROLES),
                index=list(VALID_ROLES).index(u["role"]),
                key=f"role_{u['id']}",
                label_visibility="collapsed",
            )
            if cols[3].button("Save", key=f"save_role_{u['id']}"):
                try:
                    change_role(u["id"], new_role)
                    st.success(f"Updated {u['name']} to {new_role}")
                    st.rerun()
                except ValueError as exc:
                    st.error(str(exc))

    with tab_assign:
        st.subheader("Assign CR")
        rooms = [r for r in list_all_rooms() if r["active"] and r["room_type"] in ("classroom", "lt")]
        students = list_users_by_roles(["student", "cr"])
        if rooms and students:
            with st.form("admin_assign_cr"):
                room_map = {r["name"]: r["id"] for r in rooms}
                student_map = {f"{u['name']} ({u['role']})": u["id"] for u in students}
                room_name = st.selectbox("Room", list(room_map.keys()))
                student_name = st.selectbox("Student", list(student_map.keys()))
                if st.form_submit_button("Assign CR"):
                    try:
                        assign_cr(room_map[room_name], student_map[student_name], user["id"])
                        st.success("CR assigned.")
                        st.rerun()
                    except ValueError as exc:
                        st.error(str(exc))

        st.subheader("Assign Society Rep")
        activity_rooms = [
            r for r in list_all_rooms() if r["active"] and r["room_type"] == "activity_space"
        ]
        candidates = list_users_by_roles(["student", "society_rep", "cr"])
        if activity_rooms and candidates:
            with st.form("admin_assign_society"):
                room_map = {r["name"]: r["id"] for r in activity_rooms}
                user_map = {f"{u['name']} ({u['role']})": u["id"] for u in candidates}
                room_name = st.selectbox("Activity Space", list(room_map.keys()))
                user_name = st.selectbox("User", list(user_map.keys()))
                if st.form_submit_button("Assign Society Rep"):
                    try:
                        assign_society_rep(
                            room_map[room_name],
                            user_map[user_name],
                            user["id"],
                        )
                        st.success("Society Rep assigned.")
                        st.rerun()
                    except ValueError as exc:
                        st.error(str(exc))

        st.subheader("Active Assignments")
        for a in list_all_active_assignments():
            cols = st.columns([2, 2, 2, 1])
            cols[0].write(a["room_name"])
            cols[1].write(a["user_name"])
            cols[2].write(a["assignment_role"])
            if cols[3].button("Revoke", key=f"admin_revoke_{a['id']}"):
                revoke_assignment(a["id"])
                st.rerun()

    with tab_status:
        st.subheader("Override Status")
        rooms = [r for r in list_all_rooms() if r["active"]]
        if rooms:
            room_map = {f"{r['name']} ({r['room_type']})": r for r in rooms}
            selected = st.selectbox("Room", list(room_map.keys()), key="admin_status_room")
            room = room_map[selected]
            statuses = list(statuses_for_room_type(room["room_type"]))
            with st.form("admin_override_form"):
                new_status = st.selectbox("Status", statuses)
                note = st.text_input("Note")
                if st.form_submit_button("Override"):
                    try:
                        update_status(
                            room["id"],
                            new_status,
                            note,
                            user,
                            allow_override=True,
                        )
                        st.success("Status updated.")
                        st.rerun()
                    except (PermissionError, ValueError) as exc:
                        st.error(str(exc))

            st.subheader("History")
            for entry in get_status_history(room["id"], limit=20):
                who = entry.get("updated_by_name") or "Unknown"
                note_text = entry.get("note") or "—"
                st.write(
                    f"- `{entry['created_at']}` — **{entry['status']}** — "
                    f"{note_text} (by {who})"
                )
