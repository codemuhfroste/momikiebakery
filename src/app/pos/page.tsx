import { requireSessionOrRedirect } from "@/lib/rbac";
import { listCustomers, listProducts } from "@/lib/queries";
import PosClient from "@/components/PosClient";
import { PageHeader } from "@/components/ui";

export default async function PosPage() {
  await requireSessionOrRedirect();
  const [products, customers] = await Promise.all([
    listProducts({ activeOnly: true }),
    listCustomers({ activeOnly: true }),
  ]);

  return (
    <>
      <PageHeader
        title="Register"
        subtitle="Scan or select products, then choose how the customer pays. Prices start at the SRP; any change is recorded in the Audit Log."
      />
      <PosClient
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          category_name: p.category_name,
          srp: p.srp,
          stock_qty: p.stock_qty,
        }))}
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          balance: c.balance,
          credit_limit: c.credit_limit,
        }))}
      />
    </>
  );
}
