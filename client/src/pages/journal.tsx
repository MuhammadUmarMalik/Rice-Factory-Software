import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/language-context";

export default function Journal() {
  const { t } = useLanguage();

  return (
    <div className="p-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("journal") ?? "Journal"}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t("comingSoon") ?? "Journal module coming soon."}
        </CardContent>
      </Card>
    </div>
  );
}
