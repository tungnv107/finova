import { Prisma } from "@finova/prisma";
import { prisma } from "@/lib/db";

/** Retry a whole atomic unit on a PostgreSQL serialization/unique-key race. */
export async function serializable<T>(work: (db: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002");
      if (!retryable || attempt >= 4) throw error;
      await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1) * (attempt + 1)));
    }
  }
}
