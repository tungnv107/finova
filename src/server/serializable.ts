import { Prisma } from "@finova/prisma";
import { prisma } from "@/lib/db";

/** Retry a whole atomic unit on a PostgreSQL serialization/unique-key race. */
export async function serializable<T>(work: (db: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002");
      if (!retryable || attempt >= 8) throw error;
      // Jitter prevents synchronized webhook redeliveries from colliding again.
      const delay = Math.min(750, 25 * 2 ** attempt) + Math.floor(Math.random() * 40);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
