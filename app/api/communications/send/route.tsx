import { NextResponse } from "next/server";

// TITLE: COMMUNICATION CHANNELS
const supportedChannels = new Set(["Email", "WhatsApp"]);

// TITLE: MOCK COMMUNICATION DELIVERY ENDPOINT
export async function POST(request) {
  try {
    const payload = await request.json();
    if (!payload.templateId || !payload.recipient || !supportedChannels.has(payload.channel)) {
      return NextResponse.json({ error: "Template, recipient and a supported delivery channel are required." }, { status: 400 });
    }
    const delivery = {
      id: `delivery-${Date.now()}`,
      templateId: payload.templateId,
      templateName: payload.templateName,
      channel: payload.channel,
      recipient: payload.recipient,
      recipientName: payload.recipientName || "Recipient",
      subject: payload.subject,
      body: payload.body,
      status: "Queued",
      createdAt: new Date().toISOString()
    };
    return NextResponse.json({ ok: true, delivery });
  } catch {
    return NextResponse.json({ error: "Invalid communication request." }, { status: 400 });
  }
}
