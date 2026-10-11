import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createAdminClient(supabaseUrl, supabaseServiceKey);
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const serverSupabase = createServerClient();
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();

    let authenticatedUserId = user?.id;

    if (!authenticatedUserId) {
      const authHeader = req.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "").trim();
        const admin = getAdminClient();
        const { data: jwtData } = await admin.auth.getUser(token);
        if (jwtData?.user) {
          authenticatedUserId = jwtData.user.id;
        }
      }
    }

    if (!authenticatedUserId) {
      return NextResponse.json(
        { error: "Unauthorized: Active session required to upload files" },
        { status: 401 }
      );
    }

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
