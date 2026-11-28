import "server-only";

import { fulfilment, type Fulfilment } from "./fulfilment";
import { type ChangeView, type ContractView, getContract, listChanges } from "./service";
import { today as lagosToday } from "@/lib/dates";
import { connectDb } from "@/lib/db";
import { readSettings } from "@/lib/settings/service";
import { CustomerModel } from "@/models/customer";
import { InvoiceModel } from "@/models/invoice";
import { PaymentModel } from "@/models/payment";
import { SalesOrderModel } from "@/models/sales-order";

export type ContractDashboard = {
  contract: ContractView;
  farm: { name: string; address: string; phone: string; email: string };
  customer: { id: string; name: string; contactName: string; phone: string; email: string; address: string };
  fulfilment: Fulfilment;
  orders: { id: string; number: string; deliveryDate: string; birds: number; status: string; totalKobo: number }[];
  invoices: {
    id: string;
    number: string;
    issueDate: string;
    dueDate: string;
    totalKobo: number;
    paidKobo: number;
    paidOn: string | null;
  }[];
  changes: ChangeView[];
};

/**
 * Everything the contract's page shows: the agreement and both parties, its orders and the
 * invoices that bill them, how it's being kept (fulfilment), and every change to its terms.
 */
export async function contractDashboard(
  farmId: string,
  id: string,
  today = lagosToday(),
): Promise<ContractDashboard | null> {
  await connectDb();
  const contract = await getContract(farmId, id, today);
  if (!contract) return null;
  const [settings, customer, orderDocs, changes] = await Promise.all([
    readSettings(farmId),
    CustomerModel.findById(contract.customerId).setOptions({ withDeleted: true }).lean(),
    SalesOrderModel.find({ farmId, contractId: contract.id }).sort({ deliveryDate: 1, number: 1 }).lean(),
    listChanges(farmId, contract.id),
  ]);
  const orders = orderDocs.map((o) => ({
    id: String(o._id),
    number: o.number,
    deliveryDate: o.deliveryDate,
    birds: o.lines.reduce((n, l) => n + l.birds, 0),
    status: o.status,
    totalKobo: o.totalKobo,
  }));
  // Invoices that bill its orders, voided ones aside; a draft counts once something is paid on it.
  const invoiceDocs = orderDocs.length
    ? await InvoiceModel.find({
        farmId,
        orderIds: { $in: orderDocs.map((o) => o._id) },
        state: { $ne: "void" },
        $or: [{ state: { $ne: "draft" } }, { paidKobo: { $gt: 0 } }],
      })
        .sort({ issueDate: 1, number: 1 })
        .lean()
    : [];
  const payments = invoiceDocs.length
    ? await PaymentModel.find({ farmId, invoiceId: { $in: invoiceDocs.map((i) => i._id) } })
        .sort({ date: 1 })
        .lean()
    : [];
  const invoices = invoiceDocs.map((i) => {
    const mine = payments.filter((p) => String(p.invoiceId) === String(i._id));
    return {
      id: String(i._id),
      number: i.number,
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      totalKobo: i.totalKobo,
      paidKobo: i.paidKobo,
      // Paid off on the day of the payment that cleared it.
      paidOn: i.paidKobo >= i.totalKobo && mine.length ? mine[mine.length - 1].date : null,
    };
  });
  return {
    contract,
    farm: { name: settings.businessName, address: settings.address, phone: settings.phone, email: settings.email },
    customer: {
      id: contract.customerId,
      name: customer?.name ?? contract.customerName,
      contactName: customer?.contactName ?? "",
      phone: customer?.phone ?? "",
      email: customer?.email ?? "",
      address: customer?.address ?? "",
    },
    fulfilment: fulfilment(contract, orders, invoices, today),
    orders,
    invoices,
    changes,
  };
}
