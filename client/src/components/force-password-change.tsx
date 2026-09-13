import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/stores/auth.store";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/language-context";

const MIN_LENGTH = 8;

/**
 * Blocking screen for accounts still on the shipped default password.
 *
 * AuthenticatedApp renders this instead of the app shell whenever the signed-in
 * user carries `mustChangePassword`, so there is no route that reaches the rest
 * of the application until the update succeeds. The server clears the flag as
 * part of the password write (users.controller.ts updateUser), so the response
 * is what releases the gate.
 */
export default function ForcePasswordChange() {
  const { isRTL } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.logout);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !user) return;

    if (password.length < MIN_LENGTH) {
      toast({
        title: "Change password",
        description: `Password must be at least ${MIN_LENGTH} characters.`,
        variant: "destructive",
      });
      return;
    }
    if (password !== confirmPassword) {
      toast({
        title: "Change password",
        description: "Both passwords must match.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiRequest("PATCH", `/api/users/${user.id}`, { password });
      const data = await res.json();
      // Trust the server's copy of the user; it is the side that cleared the flag.
      setSession({ token, user: data?.user ?? { ...user, mustChangePassword: false } });
      toast({ title: "Change password", description: "Password updated." });
    } catch (err: any) {
      toast({
        title: "Change password",
        description: err?.message || "Could not update the password.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const signOut = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch {
      // Local session still has to go, even if the request failed.
    } finally {
      clearSession();
      setLocation("/login");
    }
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center bg-muted/30 px-4 ${isRTL ? "font-urdu" : ""}`}
    >
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader>
          <CardTitle className={`text-2xl leading-tight ${isRTL ? "text-right" : ""}`}>
            Choose a new password
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            This account still uses the default password. Set a new one to continue.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">New password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={MIN_LENGTH}
                data-testid="force-password-new"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Confirm new password</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={MIN_LENGTH}
                data-testid="force-password-confirm"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Update password"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={signOut}>
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
