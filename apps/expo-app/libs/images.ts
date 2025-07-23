import * as MediaLibrary from "expo-media-library";
import { useSupabase, type Tables } from "@kit/supabase";
import * as ImageManipulator from "expo-image-manipulator";
import type { SupabaseClient } from '@supabase/supabase-js';
import * as FileSystem from "expo-file-system";
import { Database } from '../database.types';
import { decode } from 'base64-arraybuffer'

export type ImageMetadata = {
    width: number;
    height: number;
    creationTime: number;
    modificationTime: number;
    filename: string;
    uniqueId: string;
    extension?: string;
};

export type SyncedImage = Tables<"images"> & {
    metadata: ImageMetadata;
};

async function getImageMetadata(
    asset: MediaLibrary.Asset
): Promise<ImageMetadata> {
    const { width, height, creationTime, modificationTime, filename } = asset;
    // Create a unique ID based on file attributes
    // const uniqueId = `${filename}-${width}-${height}-${creationTime}-${modificationTime}`;
    const nameParts = filename.split('.');
    const extension = nameParts.pop()?.toLowerCase() || 'jpeg';
    const uniqueId = `${nameParts.join(".")}`;
    return {
        width,
        height,
        creationTime,
        modificationTime,
        filename,
        uniqueId,
        extension
    };
}

// Function to optimize image for upload
export async function optimizeImage(uri: string) {
    console.log("Optimizing image:", uri);
    // Resize to a maximum width of 1200px and compress to 80%
    const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }], // Resize to max width of 1200px
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );
    console.log("Optimized image result:", result);
    return result;
}

export async function syncAsset({ asset, supabase }: { asset: MediaLibrary.Asset, supabase: SupabaseClient<Database> }) {
    try {
        let user = ((await supabase.auth.getUser()).data.user);
        if (!user) throw new Error("User not authenticated");
        const metadata = await getImageMetadata(asset);

        const filePath = `${user.id}/${metadata.uniqueId}.jpeg`;
        // const localUrl = (await MediaLibrary.getAssetInfoAsync(asset)).localUri

        const optimizedImage = await optimizeImage(asset.uri);
        console.log("Uploading image to:", optimizedImage.uri);
        let contentType = 'image/jpeg';

        // Upload the blob to Supabase storage
        let file = await FileSystem.readAsStringAsync(optimizedImage.uri, {
            encoding: FileSystem.EncodingType.Base64
        })

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from("user_images")
            .upload(
                filePath,
                decode(file),
                {
                    contentType: contentType,
                    upsert: true,
                }
            );

        if (uploadError) throw uploadError;

        // Get public URL
        const {
            data: { publicUrl },
        } = supabase.storage.from("user_images").getPublicUrl(filePath);
        console.log("Public URL:", publicUrl);
        // Save to database
        const { data, error } = await supabase.from("images").insert({
            account_id: user.id,
            metadata,
            image_url: publicUrl,
            sync_status: "synced",
        });
        console.log("Synced image data:", data);
        if (error) throw error;

        return {
            image_url: publicUrl,
            metadata,
            sync_status: "synced",
        } as SyncedImage;
    } catch (error) {
        console.error("Failed to sync image:", error);
        // Continue with next image
    }
}

export const useSyncImage = () => {
    const supabase = useSupabase<Database>();
    return async (asset: MediaLibrary.Asset) => {
        return await syncAsset({ asset, supabase });
    };
}