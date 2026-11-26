import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { emailError } from "@/lib/auth-domain";
import {
  assignDemoRole,
  clearDemoRoleAssignments,
  demoEffectiveRole,
  loadDemoRoleAssignments,
} from "@/lib/demo-roles";
import { findDemoAccountByEmail } from "@/lib/demo";
import { ROLE_LABEL, type AppRole } from "@/lib/status";
import { cn } from "@/lib/utils";

const ASSIGNABLE_ROLES: AppRole[] = ["student", "cr", "teacher", "admin"];

interface RoleAssignFormProps {
  /** Demo mode stores the assignment in localStorage so it works offline. */
  demo?: boolean;
  className?: string;
}

/**
 * Lets a DoAA/DoSAA assign a role to any @thapar.edu email. If the person has
 * never signed in, the backend creates a placeholder they can claim later.
 * In demo mode the assignment is stored locally and applied on next sign-in.
 */
export function RoleAssignForm({ demo = false, className }: RoleAssignFormProps) {
  const qc = useQueryClient();
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("cr");
  const [saved, setSaved] = useState(() => loadDemoRoleAssignments());

  const invalid = email.trim() ? emailError(email.trim()) : null;

  const assign = useMutation({
    mutationFn: async () => {
      const clean = email.trim().toLowerCase();
      const problem = emailError(clean);
      if (problem) throw new Error(problem);

      if (demo) {
        const assignment = assignDemoRole(clean, role);
        const account = findDemoAccountByEmail(clean);
        return {
          email: assignment.email,
          demo: true,
          knownAccount: !!account,
        };
      }
      const user = await api.assignRole(clean, role);
      return { email: user.email, demo: false, knownAccount: true };
    },
    onSuccess: (result) => {
      if (result.demo) {
        setSaved(loadDemoRoleAssignments());
        toast.success(
          result.knownAccount
            ? `${result.email} will sign in as ${ROLE_LABEL[role]} in this browser.`
            : `${result.email} is saved locally as ${ROLE_LABEL[role]}. Create that demo account first to sign in as it.`,
        );
      } else {
        toast.success(
          `${result.email} is now ${ROLE_LABEL[role]}. They keep this role when they sign in.`,
        );
      }
      setEmail("");
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not assign that role"),
  });

  function resetDemoAssignments() {
    clearDemoRoleAssignments();
    setSaved({});
    toast.success("Demo role assignments cleared.");
  }

  return (
    <div className={cn("space-y-4", className)}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (email.trim()) assign.mutate();
        }}
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label className="text-sm font-medium" htmlFor={emailId}>
            College email
          </label>
          <Input
            id={emailId}
            type="email"
            placeholder="new.cr@thapar.edu"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={assign.isPending}
            aria-invalid={!!invalid}
            required
          />
          {invalid && <p className="mt-1 text-xs text-destructive">{invalid}</p>}
        </div>
        <div className="sm:w-48">
          <span className="text-sm font-medium">Role</span>
          <Select value={role} onValueChange={(value) => setRole(value as AppRole)}>
            <SelectTrigger aria-label="Role to assign">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSIGNABLE_ROLES.map((item) => (
                <SelectItem key={item} value={item}>
                  {ROLE_LABEL[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={!email.trim() || !!invalid || assign.isPending}>
          {assign.isPending ? "Assigning…" : "Assign role"}
        </Button>
      </form>

      {demo && (
        <div className="space-y-2 rounded-lg border border-dashed border-ink/20 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">Saved demo roles</p>
            {Object.keys(saved).length > 0 && (
              <Button type="button" size="sm" variant="ghost" onClick={resetDemoAssignments}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Demo assignments are stored in this browser only. Signing in with the assigned email
            opens that role&apos;s dashboard.
          </p>
          {Object.keys(saved).length === 0 ? (
            <p className="text-xs text-muted-foreground">No demo roles assigned yet.</p>
          ) : (
            <ul className="space-y-1">
              {Object.values(saved).map((assignment) => {
                const account = findDemoAccountByEmail(assignment.email);
                return (
                  <li
                    key={assignment.email}
                    className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                  >
                    <Check className="h-3.5 w-3.5 text-st-free" />
                    <span className="font-medium text-foreground">{assignment.email}</span>
                    <span>
                      → {ROLE_LABEL[assignment.role]}
                      {account
                        ? ` (demo ${ROLE_LABEL[demoEffectiveRole(account)]})`
                        : " (no demo account yet)"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
