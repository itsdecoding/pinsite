import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAdminClient, getAuthenticatedUser } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MAX_FILES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string[]> = {
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
  "text/plain": ["txt"],
};

function isAllowedFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_TYPES[file.type]?.includes(extension) && file.size > 0 && file.size <= MAX_FILE_BYTES;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized: Active session required to upload files" },
        { status: 401 }
      );
    }
    const authenticatedUserId = auth.user.id;

    // 2. Parse FormData
    const formData = await req.formData();
    const files = formData.getAll("file") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "No files provided for upload" },
        { status: 400 }
      );
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `You can upload up to ${MAX_FILES} files at once` }, { status: 400 });
    }

    const rejected = files.find((file) => !isAllowedFile(file));
    if (rejected) {
      return NextResponse.json(
        { error: `"${rejected.name}" is not allowed. Use PNG, JPG, GIF, WEBP, PDF or TXT up to 10 MB.` },
        { status: 400 }
      );
    }

    const admin = getAdminClient();
    const uploadedAttachments: {
      type: "image" | "file";
      url: string;
      name: string;
      size: string;
    }[] = [];

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const isImage = file.type.startsWith("image/");
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${authenticatedUserId}/${randomUUID()}-${sanitizedName}`;

      const { error: uploadError } = await admin.storage
        .from("comms-attachments")
        .upload(storagePath, buffer, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        throw new Error("Failed to upload file to storage");
      }

      const {
        data: { publicUrl },
      } = admin.storage.from("comms-attachments").getPublicUrl(storagePath);

      const sizeStr = `${(file.size / 1024).toFixed(1)} KB`;

      uploadedAttachments.push({
        type: isImage ? "image" : "file",
        url: publicUrl,
        name: file.name,
        size: sizeStr,
      });
    }

    return NextResponse.json({ attachments: uploadedAttachments });
  } catch (err: any) {
    console.error("Attachment upload failed:", err);
    return NextResponse.json(
      { error: "Failed to upload attachment" },
      { status: 500 }
    );
  }
}
