import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { createReceipt } from "@/api/cash.api";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  receiptDate: z.string().min(1, "Date is required"),
  receivedFrom: z.string().min(1, "Received from is required"),
  amount: z.string().refine((v) => parseFloat(v || "0") > 0, "Amount must be greater than 0"),
  description: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const today = () => new Date().toISOString().slice(0, 10);

export function CashReceiptForm({
  open,
  onOpenChange,
  saleRef,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  saleRef?: { invoiceNumber: string; customerName?: string };
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      receiptDate: today(),
      receivedFrom: saleRef?.customerName ?? "",
      amount: "",
      description: "",
    },
  });

  const mutate = useMutation({
    mutationFn: createReceipt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/receipts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/ledger"] });
      form.reset({ receiptDate: today(), receivedFrom: "", amount: "", description: "" });
      onOpenChange(false);
      toast({ title: "Receipt saved successfully" });
    },
    onError: async (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to save receipt";
      const parsed = message.includes(":") ? message.split(":").slice(1).join(":").trim() : message;
      toast({ title: parsed || "Failed to save receipt", variant: "destructive" });
    },
    onSettled: () => setSubmitting(false),
  });

  const onSubmit = (data: FormData) => {
    setSubmitting(true);
    mutate.mutate({
      receiptDate: data.receiptDate,
      receivedFrom: data.receivedFrom,
      amount: data.amount,
      description: data.description || undefined,
      referenceType: saleRef ? "sale" : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Cash Receipt</DialogTitle>
          <DialogDescription className="sr-only">
            Enter date, received from, amount, and optional description for the cash receipt.
          </DialogDescription>
        </DialogHeader>
        {saleRef && (
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p className="font-medium">Linked to Sale: {saleRef.invoiceNumber}</p>
          </div>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="receiptDate"
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
              name="receivedFrom"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Received From</FormLabel>
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
                {submitting ? "Saving..." : "Save Receipt"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
