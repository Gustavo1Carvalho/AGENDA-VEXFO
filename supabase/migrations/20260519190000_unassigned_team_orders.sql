-- Permite que ordens de serviço sem técnico responsável apareçam para todos os técnicos.
-- O primeiro técnico que aceitar assume a OS.

DROP POLICY IF EXISTS "Technicians view own orders" ON public.service_orders;
DROP POLICY IF EXISTS "Technicians update own orders status" ON public.service_orders;

CREATE POLICY "Technicians view own and unassigned orders" ON public.service_orders
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'tecnico')
  AND (
    technician_id = auth.uid()
    OR technician_id IS NULL
  )
);

CREATE POLICY "Technicians update own and claim unassigned orders" ON public.service_orders
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'tecnico')
  AND (
    technician_id = auth.uid()
    OR technician_id IS NULL
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'tecnico')
  AND technician_id = auth.uid()
);
