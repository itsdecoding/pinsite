import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthenticatedUser } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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
      const storagePath = `${authenticatedUserId}/${Date.now()}-${sanitizedName}`;

      const { error: uploadError } = await admin.storage
        .from("comms-attachments")
        .upload(storagePath, buffer, {
          contentType: file.type || "application/octet-stream",
          upsert: true,
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        throw new Error(uploadError.message || "Failed to upload file to storage");
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
      { error: err.message || "Failed to upload attachment" },
      { status: 500 }
    );
  }
}
