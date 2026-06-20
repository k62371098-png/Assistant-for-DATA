import { supabase } from "./client";
import type { Dataset, ChatMessage, Report, Insight } from "@/types";

// Upload file to Supabase Storage
export async function uploadDatasetFile(file: File, datasetId: string): Promise<string> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("Not authenticated");

  const filePath = `${user.user.id}/${datasetId}_${file.name}`;
  const { error, data } = await supabase.storage.from("datasets").upload(filePath, file);
  if (error) throw error;
  
  // Return public URL or path
  return data.path;
}

// Insert dataset metadata into Supabase Database
export async function saveDatasetMetadata(dataset: Dataset, filePath: string) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return;

  const { error } = await supabase.from("datasets").insert({
    id: dataset.id,
    user_id: user.user.id,
    name: dataset.name,
    size: dataset.size,
    schema: dataset.schema,
    file_path: filePath,
  });

  if (error) console.error("Error saving dataset metadata:", error);
}

// Save Chat Message
export async function saveChatMessage(message: ChatMessage, datasetId: string | null) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return;

  const { error } = await supabase.from("chat_messages").insert({
    id: message.id,
    user_id: user.user.id,
    dataset_id: datasetId,
    role: message.role,
    content: message.content,
    provider: message.provider,
    query_result: message.queryResult,
    created_at: message.timestamp,
  });

  if (error) console.error("Error saving chat message:", error);
}

// Fetch all Datasets for user
export async function fetchDatasets(): Promise<Partial<Dataset>[]> {
  const { data, error } = await supabase.from("datasets").select("*").order("uploaded_at", { ascending: false });
  if (error) {
    console.error("Error fetching datasets:", error);
    return [];
  }
  return data.map(d => ({
    id: d.id,
    name: d.name,
    size: d.size,
    schema: d.schema,
    rows: [], // Rows must be fetched on demand from storage
  }));
}

// Download dataset rows from Supabase Storage
export async function downloadDatasetRows(datasetId: string): Promise<any[]> {
  const { data: dbData } = await supabase.from("datasets").select("file_path").eq("id", datasetId).single();
  if (!dbData || !dbData.file_path) throw new Error("Dataset file path not found");
  
  const { data, error } = await supabase.storage.from("datasets").download(dbData.file_path);
  if (error) throw error;
  
  const filename = dbData.file_path.split("_").slice(1).join("_") || "downloaded_dataset.csv";
  const file = new File([data], filename, { type: data.type });
  
  const { parseFile } = await import("@/lib/data/parser");
  const dataset = await parseFile(file);
  return dataset.rows;
}
