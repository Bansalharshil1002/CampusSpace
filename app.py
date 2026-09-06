"""Room Status Tracker — Streamlit prototype entrypoint."""

from __future__ import annotations

import streamlit as st

from db.database import init_db, is_db_empty
from db.seed import seed
from services.user_service import get_user, list_users
from ui.admin_panel import render_admin_panel
from ui.cr_panel import render_cr_panel
from ui.dashboard import render_dashboard
from ui.teacher_panel import render_teacher_panel


def ensure_database() -> None:
    init_db()
    if is_db_empty():
        seed()


def login_screen() -> None:
    st.title("Room Status Tracker")
    st.subheader("Login / Select User")
    st.caption("Prototype only — no real authentication.")

    users = list_users()
    if not users:
        st.error("No users found. Run: python -m db.seed")
        return

    labels = {f"{u['name']} ({u['role']})": u["id"] for u in users}
    selected = st.selectbox("User", list(labels.keys()))
    user_id = labels[selected]
    user = get_user(user_id)
    if user:
        st.write(f"Role: **{user['role']}**")

    if st.button("Continue", type="primary"):
        st.session_state.current_user_id = user_id
        st.rerun()


def nav_options_for_role(role: str) -> list[str]:
    options = ["Dashboard"]
    if role in ("cr", "society_rep"):
        options.append("My Updates")
    if role == "teacher":
        options.append("Teacher Panel")
    if role == "admin":
        options.append("Admin Panel")
    return options


def main() -> None:
    st.set_page_config(page_title="Room Status Tracker", layout="wide")
    ensure_database()

    if "current_user_id" not in st.session_state:
        login_screen()
        return

    user = get_user(st.session_state.current_user_id)
    if not user:
        st.session_state.pop("current_user_id", None)
        st.rerun()
        return

    with st.sidebar:
        st.title("Room Status Tracker")
        st.write(f"**{user['name']}**")
        st.write(f"Role: `{user['role']}`")
        if st.button("Switch User"):
            st.session_state.pop("current_user_id", None)
            st.rerun()

        options = nav_options_for_role(user["role"])
        page = st.radio("Navigation", options, key="nav_page")

    if page == "Dashboard":
        render_dashboard()
    elif page == "My Updates":
        render_cr_panel(user)
    elif page == "Teacher Panel":
        render_teacher_panel(user)
    elif page == "Admin Panel":
        render_admin_panel(user)


if __name__ == "__main__":
    main()
