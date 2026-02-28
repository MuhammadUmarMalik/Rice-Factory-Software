import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPayment } from "@/api/cash.api";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  paymentDate: z.string().min(1, "Date is required"),
  paidTo: z.string().min(1, "Paid to is required"),
  amount: z.string().refine((v) => parseFloat(v || "0") > 0, "Amount must be greater than 0"),
  description: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const today = () => new Date().toISOString().slice(0, 10);

export function CashPaymentForm({
  open,
  onOpenChange,
  purchaseRef,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  purchaseRef?: { invoiceNumber: string; supplierName?: string };
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      paymentDate: today(),
      paidTo: purchaseRef?.supplierName ?? "",
      amount: "",
      description: "",
    },
  });

  const mutate = useMutation({
    mutationFn: createPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/ledger"] });
      form.reset({ paymentDate: today(), paidTo: "", amount: "", description: "" });
      onOpenChange(false);
      toast({ title: "Payment saved successfully" });
    },
    onError: async (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to save payment";
      const parsed = message.includes(":") ? message.split(":").slice(1).join(":").trim() : message;
      toast({ title: parsed || "Failed to save payment", variant: "destructive" });
    },
    onSettled: () => setSubmitting(false),
  });

  const onSubmit = (data: FormData) => {
    setSubmitting(true);
    mutate.mutate({
      paymentDate: data.paymentDate,
      paidTo: data.paidTo,
      amount: data.amount,
      description: data.description || undefined,
      referenceType: purchaseRef ? "purchase" : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Cash Payment</DialogTitle>
        </DialogHeader>
        {purchaseRef && (
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p className="font-medium">Linked to Purchase: {purchaseRef.invoiceNumber}</p>
          </div>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="paymentDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="paidTo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paid To</FormLabel>
                  <FormControl>
                    <Input placeholder="Name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (Rs.)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Notes" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Save Payment"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
