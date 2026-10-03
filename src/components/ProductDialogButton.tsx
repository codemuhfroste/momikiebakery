"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Category, Product } from "@/lib/types";
import Modal from "./Modal";
import ProductForm from "./ProductForm";

// Opens the product form in a dialog rather than navigating to its own page,
// so adding or correcting an item doesn't lose your place in the list.
//
// The full pages stay in place: they are what the register links to when an
// unknown barcode is scanned, and the edit page is the only place showing a
// product's SRP history, which the dialog links to.
export default function ProductDialogButton({
  categories,
  product,
  className,
  children,
}: {
  categories: Category[];
  product?: Product;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function close() {
    setOpen(false);
  }

  function saved() {
    setOpen(false);
    // The action revalidates on the server; this re-renders the list so the
    // new or edited row shows up straight away.
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>

      {open && (
        <Modal
          title={product ? product.name : "Add product"}
          description={
            product
              ? "Changes to the SRP are recorded in the Audit Log."
              : "To link a barcode, click the Barcode box and scan the product."
          }
          onClose={close}
          footer={
            product ? (
              <Link href={`/products/${product.id}`} className="text-sm text-brand hover:underline">
                Open full page for SRP history →
              </Link>
            ) : undefined
          }
        >
          {/* Remounted per open, so a cancelled edit doesn't persist. */}
          <ProductForm
            key={product?.id ?? "new"}
            product={product}
            categories={categories}
            onSaved={saved}
          />
        </Modal>
      )}
    </>
  );
}
