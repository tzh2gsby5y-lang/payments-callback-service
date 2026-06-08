import { OpenAPIObject } from '@nestjs/swagger';
import {
  RequestBodyObject,
  ReferenceObject,
  ResponseObject,
  SchemaObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

export const noopUseCase = {
  execute: () => undefined,
};

export type OpenApiSchemaRef = SchemaObject & {
  $ref?: string;
  allOf?: { $ref?: string }[];
  anyOf?: { required: string[] }[];
};

export type OpenApiComponentSchema = {
  required?: string[];
  properties?: Record<string, { enum?: string[] }>;
};

export function componentSchema(document: OpenAPIObject, name: string): OpenApiComponentSchema {
  const schema = document.components?.schemas?.[name];
  if (!schema || isReferenceObject(schema)) {
    throw new Error(`Missing OpenAPI component schema ${name}`);
  }

  return schema as OpenApiComponentSchema;
}

export function getRequestBodySchemaRef(document: OpenAPIObject, path: string): OpenApiSchemaRef {
  const operation = document.paths[path]?.post;
  if (!operation || !operation.requestBody || isReferenceObject(operation.requestBody)) {
    throw new Error(`Missing JSON request body for ${path}`);
  }

  const schema = operation.requestBody.content['application/json']?.schema;
  if (!schema) {
    throw new Error(`Missing JSON request schema for ${path}`);
  }

  return schema as OpenApiSchemaRef;
}

export function getResponseSchemaRef(
  document: OpenAPIObject,
  path: string,
  statusCode: string,
): OpenApiSchemaRef {
  const response = document.paths[path]?.post?.responses[statusCode];
  if (!response || isReferenceObject(response)) {
    throw new Error(`Missing ${statusCode} response for ${path}`);
  }

  const schema = response.content?.['application/json']?.schema;
  if (!schema) {
    throw new Error(`Missing ${statusCode} JSON response schema for ${path}`);
  }

  return schema as OpenApiSchemaRef;
}

function isReferenceObject(
  value: ReferenceObject | SchemaObject | RequestBodyObject | ResponseObject,
): value is ReferenceObject {
  return '$ref' in value;
}
