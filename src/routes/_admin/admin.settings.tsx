import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_admin/admin/settings")({
  component: Settings,
});

function Settings() {
  const qc = useQueryClient();
  const { data: companies } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("*").order("display_order");
      return data || [];
    },
  });

  const [rows, setRows] = useState<{ id: string; name: string; full_strength: number }[]>([]);

  useEffect(() => {
    if (companies) setRows(companies.map((c) => ({ id: c.id, name: c.name, full_strength: c.full_strength })));
  }, [companies]);

  const save = useMutation({
    mutationFn: async () => {
      for (const r of rows) {
        const { error } = await supabase
          .from("companies")
          .update({ name: r.name, full_strength: r.full_strength })
          .eq("id", r.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("บันทึกแล้ว");
      qc.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>ตั้งค่าหมวด</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((r, i) => (
            <div key={r.id} className="grid grid-cols-[1fr_140px] gap-2">
              <Input
                value={r.name}
                onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <Input
                type="number"
                value={r.full_strength}
                onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, full_strength: Number(e.target.value) } : x)))}
                placeholder="ยอดเต็ม"
              />
            </div>
          ))}
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
