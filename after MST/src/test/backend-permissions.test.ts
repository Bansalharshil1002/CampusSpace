/**
 * End-to-end tests against the real backend: sign-in, status updates, and
 * permission rules. Needs SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and
 * SUPABASE_SERVICE_ROLE_KEY in the environment; skipped otherwise.
 * Creates throwaway users and a throwaway room, and deletes them afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env["SUPABASE_URL"];
const ANON = process.env["SUPABASE_PUBLISHABLE_KEY"];
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const enabled = !!(URL && ANON && SERVICE);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const tag = Math.random().toString(36).slice(2, 8);
const PASSWORD = `Test-${tag}-Pw!93`;

let admin: SupabaseClient;
const createdUsers: string[] = [];
const createdRooms: string[] = [];

async function makeUser(name: string) {
  const email = `rst-test-${name}-${tag}@thapar.edu`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { automated_test: "true", name },
  });
  if (error) throw error;
  createdUsers.push(data.user.id);
  return { id: data.user.id, email };
}

async function signIn(email: string) {
  const c = createClient(URL!, ANON!, opts);
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return c;
}

async function makeRoom(type: "classroom" | "activity_space") {
  const { data, error } = await admin
    .from("rooms")
    .insert({ code: `TEST-${type}-${tag}`, building: "Test Block", floor: 0, room_type: type })
    .select("id")
    .single();
  if (error) throw error;
  createdRooms.push(data.id);
  return data.id as string;
}

const statusOf = async (room: string) =>
  (await admin.from("rooms").select("current_status,status_note").eq("id", room).single()).data;

describe.skipIf(!enabled)("backend: sign-in and room status permissions", () => {
  let classroom: string, otherClassroom: string, activity: string;
  let student: SupabaseClient, cr: SupabaseClient, teacher: SupabaseClient;
  let crId: string;

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, opts);
    classroom = await makeRoom("classroom");
    activity = await makeRoom("activity_space");
    const { data } = await admin
      .from("rooms")
      .insert({
        code: `TEST-classroom2-${tag}`,
        building: "Test Block",
        floor: 0,
        room_type: "classroom",
      })
      .select("id")
      .single();
    otherClassroom = data!.id;
    createdRooms.push(otherClassroom);

    const s = await makeUser("student");
    const c = await makeUser("cr");
    const t = await makeUser("teacher");
    crId = c.id;
    await admin.from("user_roles").insert([
      { user_id: c.id, role: "cr" },
      { user_id: t.id, role: "teacher" },
    ]);
    await admin.from("room_assignments").insert({ user_id: c.id, room_id: classroom });

    student = await signIn(s.email);
    cr = await signIn(c.email);
    teacher = await signIn(t.email);
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    for (const id of createdRooms) await admin.from("rooms").delete().eq("id", id);
    for (const id of createdUsers) await admin.auth.admin.deleteUser(id);
  }, 60_000);

  it("rejects accounts outside @thapar.edu", async () => {
    const { error } = await admin.auth.admin.createUser({
      email: `rst-test-outsider-${tag}@gmail.com`,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { automated_test: "true" },
    });
    expect(error).not.toBeNull();
  });

  it("signs in a @thapar.edu user and gives them the student role", async () => {
    const { data } = await student.auth.getUser();
    const roles = await student.from("user_roles").select("role").eq("user_id", data.user!.id);
    expect(roles.data?.map((r) => r.role)).toEqual(["student"]);
  });

  it("anonymous visitors cannot update a room", async () => {
    const anon = createClient(URL!, ANON!, opts);
    const { error } = await anon.rpc("set_room_status", { _room: classroom, _status: "ONGOING" });
    expect(error).not.toBeNull();
    expect((await statusOf(classroom))?.current_status).toBe("FREE");
  });

  it("students cannot update a room", async () => {
    const { error } = await student.rpc("set_room_status", {
      _room: classroom,
      _status: "CANCELLED",
    });
    expect(error?.message).toMatch(/not allowed/i);
    expect((await statusOf(classroom))?.current_status).toBe("FREE");
  });

  it("an assigned CR can update their classroom, and history records it", async () => {
    const { error } = await cr.rpc("set_room_status", {
      _room: classroom,
      _status: "NOT_ARRIVED",
      _note: "Waiting 10 min",
    });
    expect(error).toBeNull();
    expect(await statusOf(classroom)).toEqual({
      current_status: "NOT_ARRIVED",
      status_note: "Waiting 10 min",
    });
    const log = await admin.from("status_logs").select("status,user_id").eq("room_id", classroom);
    expect(log.data).toEqual([{ status: "NOT_ARRIVED", user_id: crId }]);
  });

  it("a CR cannot update a classroom they are not assigned to", async () => {
    const { error } = await cr.rpc("set_room_status", {
      _room: otherClassroom,
      _status: "ONGOING",
    });
    expect(error?.message).toMatch(/not allowed/i);
    expect((await statusOf(otherClassroom))?.current_status).toBe("FREE");
  });

  it("a CR cannot bypass the rules by editing the room directly", async () => {
    await cr.from("rooms").update({ current_status: "CANCELLED" }).eq("id", classroom);
    expect((await statusOf(classroom))?.current_status).toBe("NOT_ARRIVED");
  });

  it("a teacher can override a classroom but not an activity space", async () => {
    expect(
      (await teacher.rpc("set_room_status", { _room: otherClassroom, _status: "CHANGED" })).error,
    ).toBeNull();
    const { error } = await teacher.rpc("set_room_status", {
      _room: activity,
      _status: "OCCUPIED",
    });
    expect(error?.message).toMatch(/not allowed/i);
  });

  it("a deactivated assignment stops the CR from updating", async () => {
    await admin.from("room_assignments").update({ active: false }).eq("user_id", crId);
    const { error } = await cr.rpc("set_room_status", { _room: classroom, _status: "FREE" });
    expect(error?.message).toMatch(/not allowed/i);
  });
});
