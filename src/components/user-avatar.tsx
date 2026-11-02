"use client";

import Image from "next/image";
import { useState } from "react";

export function UserAvatar({ name, image }: { name: string; image: string | null }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);

  if (!image || image === failedImage) {
    return <span aria-hidden="true">{name.trim().charAt(0).toUpperCase() || "U"}</span>;
  }

  return <Image
    className="user-avatar-image"
    src={image}
    alt=""
    width={64}
    height={64}
    unoptimized
    referrerPolicy="no-referrer"
    onError={() => setFailedImage(image)}
  />;
}
