import { Form, FormField, FormPage } from './schema';

export function generateFormFromSchema(schema: Record<string, any>): Form {
  const pages: FormPage[] = [];
  const fields: FormField[] = [];

  Object.entries(schema).forEach(([key, config]: [string, any]) => {
    const field: FormField = {
      id: key,
      type: config.type || 'text',
      label: config.label || key,
      description: config.description,
      required: config.required || false,
      placeholder: config.placeholder,
      options: config.options,
      validation: config.validation,
      conditional: config.conditional,
    };
    fields.push(field);
  });

  pages.push({
    id: 'page-1',
    title: 'Form',
    fields,
  });

  return {
    id: `form-${Date.now()}`,
    name: schema.name || 'Untitled Form',
    description: schema.description,
    pages,
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function reorderFields(form: Form, pageId: string, fieldIds: string[]): Form {
  return {
    ...form,
    pages: form.pages.map(page => {
      if (page.id !== pageId) return page;
      return {
        ...page,
        fields: fieldIds
          .map(id => page.fields.find(f => f.id === id))
          .filter(Boolean) as FormField[],
      };
    }),
    updatedAt: new Date(),
  };
}

export function addField(form: Form, pageId: string, field: FormField): Form {
  return {
    ...form,
    pages: form.pages.map(page => {
      if (page.id !== pageId) return page;
      return { ...page, fields: [...page.fields, field] };
    }),
    updatedAt: new Date(),
  };
}

export function removeField(form: Form, pageId: string, fieldId: string): Form {
  return {
    ...form,
    pages: form.pages.map(page => {
      if (page.id !== pageId) return page;
      return { ...page, fields: page.fields.filter(f => f.id !== fieldId) };
    }),
    updatedAt: new Date(),
  };
}
