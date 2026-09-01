import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Users, UserPlus, Pencil } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/stores/auth.store";

type UserRow = {
  id: number;
  username: string;
  fullName: string;
  role: string;
  isActive?: boolean;
};

const roles = ["admin", "manager", "accountant", "hr", "operator"] as const;

const userSchema = z.object({
  username: z.string().min(1, "Username is required"),
  fullName: z.string().min(1, "Full name is required"),
  role: z.enum(roles),
  password: z.string().min(8, "Password must be at least 8 chars").optional(),
  isActive: z.enum(["active", "inactive"]).default("active"),
});

type UserFormData = z.infer<typeof userSchema>;

export default function UsersAdminPage() {
  const { toast } = useToast();
  const role = useAuthStore((state) => state.user?.role || "operator");
  const isAdmin = role === "admin";

  const [open, setOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);

  const { data: users = [], isLoading } = useQuery<UserRow[]>({
    queryKey: ["/api/users"],
    enabled: isAdmin,
  });

  const form = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      username: "",
      fullName: "",
      role: "operator",
      password: "",
      isActive: "active",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: UserFormData) =>
      apiRequest("POST", "/api/users", {
        username: payload.username,
        fullName: payload.fullName,
        role: payload.role,
        password: payload.password,
        isActive: payload.isActive === "active",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setOpen(false);
      form.reset();
      toast({ title: "User created" });
    },
    onError: (err: any) =>
      toast({ title: "Create failed", description: err?.message || "Error", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: number; data: UserFormData }) => {
      const body: Record<string, any> = {
        fullName: payload.data.fullName,
        role: payload.data.role,
        isActive: payload.data.isActive === "active",
      };
      if (payload.data.password) body.password = payload.data.password;
      return apiRequest("PATCH", `/api/users/${payload.id}`, body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setOpen(false);
      setEditingUser(null);
      form.reset();
      toast({ title: "User updated" });
    },
    onError: (err: any) =>
      toast({ title: "Update failed", description: err?.message || "Error", variant: "destructive" }),
  });

  const openCreate = () => {
    setEditingUser(null);
    form.reset({
      username: "",
      fullName: "",
      role: "operator",
      password: "",
      isActive: "active",
    });
    setOpen(true);
  };

  const openEdit = (user: UserRow) => {
    setEditingUser(user);
    form.reset({
      username: user.username,
      fullName: user.fullName,
      role: (user.role as any) || "operator",
      password: "",
      isActive: user.isActive ? "active" : "inactive",
    });
    setOpen(true);
  };

  const onSubmit = (values: UserFormData) => {
    if (!editingUser && !values.password) {
      form.setError("password", { type: "manual", message: "Password is required" });
      return;
    }
    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, data: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const columns: Column<UserRow>[] = useMemo(
    () => [
      { key: "username", title: "Username", render: (u) => <span className="font-mono">{u.username}</span> },
      { key: "fullName", title: "Full Name", render: (u) => <span className="font-medium">{u.fullName}</span> },
      {
        key: "role",
        title: "Role",
        render: (u) => <Badge variant="secondary" className="uppercase">{u.role}</Badge>,
      },
      {
        key: "status",
        title: "Status",
        render: (u) => (
          <Badge variant={u.isActive ? "default" : "secondary"}>
            {u.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        key: "actions",
        title: "",
        render: (u) => (
          <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
        ),
      },
    ],
    [],
  );

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Admin access required.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">User Management</h1>
          <p className="text-sm text-muted-foreground">Create and manage roles and access.</p>
        </div>
        <Button onClick={openCreate}>
          <UserPlus className="h-4 w-4 mr-2" />
          New User
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Users</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={users}
            isLoading={isLoading}
            emptyMessage="No users found"
            searchable
            testIdPrefix="users"
          />
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(next) => {
        setOpen(next);
        if (!next) setEditingUser(null);
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Edit User" : "Create User"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={!!editingUser} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {roles.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>{editingUser ? "Reset Password (optional)" : "Password"}</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} autoComplete="new-password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingUser ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
