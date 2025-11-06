import { ContentFormat } from "../types/post";
import { getFieldsForFormat } from "./contentFormatFields";

export interface LegacyPostData {
  title?: string;
  content?: {
    copy?: string;
    hashtags?: string[];
    mentions?: string[];
  };
  postType?: string;
  contentFormat?: ContentFormat;
  [key: string]: any;
}

export interface DynamicPostData {
  dynamicFields: Record<string, any>;
  contentFormat?: ContentFormat;
  postType?: string;
  [key: string]: any;
}

export function isLegacyFormat(postData: any): boolean {
  return !postData.dynamicFields || Object.keys(postData.dynamicFields).length === 0;
}

export function convertLegacyToDynamic(postData: LegacyPostData): Record<string, any> {
  const dynamicFields: Record<string, any> = {};

  if (!postData.contentFormat) {
    return dynamicFields;
  }

  const fields = getFieldsForFormat(postData.contentFormat);

  fields.forEach((field) => {
    switch (field.name) {
      case "title":
        dynamicFields.title = postData.title || "";
        break;

      case "caption":
      case "description":
      case "body":
      case "overlayText":
      case "tweet1":
        dynamicFields[field.name] = postData.content?.copy || "";
        break;

      case "hashtags":
        dynamicFields.hashtags = postData.content?.hashtags || [];
        break;

      case "mentions":
        dynamicFields.mentions = postData.content?.mentions || [];
        break;

      default:
        if (!dynamicFields[field.name]) {
          dynamicFields[field.name] = "";
        }
        break;
    }
  });

  return dynamicFields;
}

export function convertDynamicToLegacy(dynamicFields: Record<string, any>, contentFormat?: ContentFormat): { title: string; content: { copy: string; hashtags: string[]; mentions: string[] } } {
  const result = {
    title: "",
    content: {
      copy: "",
      hashtags: [] as string[],
      mentions: [] as string[],
    },
  };

  result.title = dynamicFields.title || "";

  result.content.copy = dynamicFields.caption || dynamicFields.description || dynamicFields.body || dynamicFields.overlayText || dynamicFields.tweet1 || "";

  result.content.hashtags = Array.isArray(dynamicFields.hashtags) ? dynamicFields.hashtags : [];
  result.content.mentions = Array.isArray(dynamicFields.mentions) ? dynamicFields.mentions : [];

  return result;
}

export function prepareSavePayload(formData: any): any {
  const payload: any = { ...formData };

  if (formData.postType === "social" && formData.dynamicFields) {
    const legacy = convertDynamicToLegacy(formData.dynamicFields, formData.contentFormat);
    payload.title = legacy.title;
    payload.content = legacy.content;
  }

  return payload;
}

export function initializeFormDataFromPost(post: any): any {
  const initialData: any = { ...post };

  if (post.postType === "social" && post.contentFormat) {
    if (isLegacyFormat(post)) {
      initialData.dynamicFields = convertLegacyToDynamic(post);
    } else if (post.dynamicFields) {
      initialData.dynamicFields = { ...post.dynamicFields };
    }
  }

  return initialData;
}
