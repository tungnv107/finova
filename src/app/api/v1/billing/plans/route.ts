import { failure, respond } from "@/server/http";
import { getPublishedPrices } from "@/modules/billing/service";

export async function GET() {
  try { return respond({ lite: { priceVnd: 0 }, premium: await getPublishedPrices() }); }
  catch (error) { return failure(error); }
}
