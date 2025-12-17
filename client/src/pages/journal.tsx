import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Journal() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Journal</h1>
        <p className="text-sm text-muted-foreground">Journal entries coming soon.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Journal</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          This page is a placeholder until journal functionality is implemented.
        </CardContent>
      </Card>
    </div>
  );
}
