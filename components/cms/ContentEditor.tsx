'use client';

import React, { useState, useCallback } from 'react';
import { format } from 'date-fns';

interface EditorProps {
  content?: any;
  contentType: any;
  onSave: (data: any) => Promise<void>;
  onPublish: (data: any) => Promise<void>;
}

export function ContentEditor({ content, contentType, onSave, onPublish }: EditorProps) {
  const [data, setData] = useState(content?.data || {});
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [scheduledPublish, setScheduledPublish] = useState<Date | null>(
    content?.scheduledPublishAt || null
  );
  const [state, setState] = useState(content?.state || 'draft');

  const handleFieldChange = useCallback((fieldName: string, value: any) => {
    setData((prev) => ({ ...prev, [fieldName]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave({ ...data, state });
    } finally {
      setSaving(false);
    }
  }, [data, state, onSave]);

  const handlePublish = useCallback(async () => {
    setPublishing(true);
    try {
      await onPublish({ ...data, state: 'published', scheduledPublishAt: scheduledPublish });
    } finally {
      setPublishing(false);
    }
  }, [data, scheduledPublish, onPublish]);

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold">{content?.title || 'New Content'}</h1>
        <div className="flex gap-2">
          <span className="px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-800">
            {state}
          </span>
        </div>
      </div>

      <div className="space-y-4 mb-6">
        {contentType?.fields?.map((field: any) => (
          <div key={field.id}>
            <label className="block text-sm font-semibold mb-2">{field.name}</label>
            {field.type === 'richText' && (
              <textarea
                value={data[field.name] || ''}
                onChange={(e) => handleFieldChange(field.name, e.target.value)}
                className="w-full h-32 p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter rich text content..."
              />
            )}
            {field.type === 'text' && (
              <input
                type="text"
                value={data[field.name] || ''}
                onChange={(e) => handleFieldChange(field.name, e.target.value)}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter text..."
              />
            )}
            {field.type === 'number' && (
              <input
                type="number"
                value={data[field.name] || ''}
                onChange={(e) => handleFieldChange(field.name, Number(e.target.value))}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
            {field.type === 'date' && (
              <input
                type="date"
                value={data[field.name] || ''}
                onChange={(e) => handleFieldChange(field.name, e.target.value)}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
            {field.type === 'boolean' && (
              <input
                type="checkbox"
                checked={data[field.name] || false}
                onChange={(e) => handleFieldChange(field.name, e.target.checked)}
                className="h-4 w-4"
              />
            )}
          </div>
        ))}
      </div>

      <div className="mb-6 p-4 bg-gray-50 rounded">
        <h3 className="font-semibold mb-3">Publishing Options</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-2">Schedule Publish</label>
            <input
              type="datetime-local"
              value={scheduledPublish ? format(scheduledPublish, "yyyy-MM-dd'T'HH:mm") : ''}
              onChange={(e) => setScheduledPublish(e.target.value ? new Date(e.target.value) : null)}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">State</label>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="draft">Draft</option>
              <option value="review">In Review</option>
              <option value="published">Published</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Draft'}
        </button>
        <button
          onClick={handlePublish}
          disabled={publishing}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          {publishing ? 'Publishing...' : 'Publish'}
        </button>
      </div>
    </div>
  );
}
