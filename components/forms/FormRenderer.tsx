"use client";

import React, { useState, useCallback, useEffect } from "react";
import { generateValidationSchema, getVisibleFields, evaluateConditionals } from "@/lib/forms/schemas";
import type { FormField, FormSection } from "@/lib/custom-fields/types";
import type { FormDefinition } from "@/lib/forms/builder";

interface FormRendererProps {
  form: FormDefinition;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onError?: (error: Error) => void;
}

export function FormRenderer({ form, onSubmit, onError }: FormRendererProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const validationSchema = generateValidationSchema(form.fields);
  const isMultiStep = form.settings.multiStep;
  const visibleFields = getVisibleFields(form.fields, formData);
  const hiddenFields = evaluateConditionals(form.fields, formData);

  const handleChange = useCallback((fieldId: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    setErrors((prev) => ({ ...prev, [fieldId]: "" }));
  }, []);

  const validateForm = useCallback(() => {
    try {
      validationSchema.parse(formData);
      setErrors({});
      return true;
    } catch (err: any) {
      const newErrors: Record<string, string> = {};
      if (err.errors) {
        for (const error of err.errors) {
          const path = error.path.join(".");
          newErrors[path] = error.message;
        }
      }
      setErrors(newErrors);
      return false;
    }
  }, [formData, validationSchema]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    try {
      await onSubmit(formData);
      setSubmitted(true);
    } catch (error) {
      onError?.(error as Error);
    } finally {
      setLoading(false);
    }
  };

  if (submitted && form.settings.confirmationMessage) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
        <p className="text-green-900">{form.settings.confirmationMessage}</p>
        {form.settings.redirectUrl && (
          <a href={form.settings.redirectUrl} className="mt-4 inline-block text-blue-600 hover:underline">
            Continue →
          </a>
        )}
      </div>
    );
  }

  const fieldsByStep = isMultiStep
    ? [
        form.fields.slice(0, Math.ceil(form.fields.length / 3)),
        form.fields.slice(Math.ceil(form.fields.length / 3), (2 * Math.ceil(form.fields.length / 3))),
        form.fields.slice(2 * Math.ceil(form.fields.length / 3)),
      ]
    : [form.fields];

  const fieldsToRender = fieldsByStep[currentStep] || [];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {form.settings.showProgressBar && isMultiStep && (
        <div className="mb-4">
          <div className="flex gap-2">
            {fieldsByStep.map((_, idx) => (
              <div
                key={idx}
                className={`h-1 flex-1 rounded-full ${idx <= currentStep ? "bg-blue-600" : "bg-gray-200"}`}
              />
            ))}
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Step {currentStep + 1} of {fieldsByStep.length}
          </p>
        </div>
      )}

      <div className="space-y-5">
        {fieldsToRender.map((field) => {
          const isHidden = hiddenFields.includes(field.id);
          if (isHidden) return null;

          return (
            <div key={field.id} className={field.disabled ? "opacity-50" : ""}>
              <FormField
                field={field}
                value={formData[field.id]}
                onChange={(value) => handleChange(field.id, value)}
                error={errors[field.id]}
              />
            </div>
          );
        })}
      </div>

      <div className="flex gap-3 pt-4">
        {isMultiStep && currentStep > 0 && (
          <button
            type="button"
            onClick={() => setCurrentStep(currentStep - 1)}
            className="rounded bg-gray-200 px-4 py-2 hover:bg-gray-300"
            disabled={loading}
          >
            Previous
          </button>
        )}

        {isMultiStep && currentStep < fieldsByStep.length - 1 ? (
          <button
            type="button"
            onClick={() => {
              if (validateForm()) setCurrentStep(currentStep + 1);
            }}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            disabled={loading}
          >
            Next
          </button>
        ) : (
          <button
            type="submit"
            className="rounded bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Submitting..." : "Submit"}
          </button>
        )}
      </div>
    </form>
  );
}

interface FormFieldProps {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}

function FormField({ field, value, onChange, error }: FormFieldProps) {
  const inputId = `field-${field.id}`;

  return (
    <div>
      <label htmlFor={inputId} className="mb-2 block text-sm font-medium">
        {field.label}
        {field.required && <span className="text-red-600">*</span>}
      </label>

      {field.helpText && <p className="mb-2 text-xs text-gray-500">{field.helpText}</p>}

      {field.type === "text" && (
        <input
          id={inputId}
          type="text"
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={field.disabled}
          maxLength={field.validation?.maxLength}
          className={`w-full rounded border px-3 py-2 ${error ? "border-red-500" : "border-gray-300"}`}
        />
      )}

      {field.type === "email" && (
        <input
          id={inputId}
          type="email"
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={field.disabled}
          className={`w-full rounded border px-3 py-2 ${error ? "border-red-500" : "border-gray-300"}`}
        />
      )}

      {field.type === "number" && (
        <input
          id={inputId}
          type="number"
          value={(value as number) || ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}
          placeholder={field.placeholder}
          disabled={field.disabled}
          min={field.validation?.minValue}
          max={field.validation?.maxValue}
          className={`w-full rounded border px-3 py-2 ${error ? "border-red-500" : "border-gray-300"}`}
        />
      )}

      {field.type === "textarea" && (
        <textarea
          id={inputId}
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={field.disabled}
          maxLength={field.validation?.maxLength}
          rows={4}
          className={`w-full rounded border px-3 py-2 ${error ? "border-red-500" : "border-gray-300"}`}
        />
      )}

      {field.type === "select" && (
        <select
          id={inputId}
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={field.disabled}
          className={`w-full rounded border px-3 py-2 ${error ? "border-red-500" : "border-gray-300"}`}
        >
          <option value="">Select an option...</option>
          {field.options?.map((opt) => (
            <option key={opt.id} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {field.type === "checkbox" && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={(value as boolean) || false}
            onChange={(e) => onChange(e.target.checked)}
            disabled={field.disabled}
            className="rounded"
          />
          <span className="text-sm">{field.placeholder || "I agree"}</span>
        </label>
      )}

      {field.type === "date" && (
        <input
          id={inputId}
          type="date"
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={field.disabled}
          className={`w-full rounded border px-3 py-2 ${error ? "border-red-500" : "border-gray-300"}`}
        />
      )}

      {field.type === "rating" && (
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((rating) => (
            <button
              key={rating}
              type="button"
              onClick={() => onChange(rating)}
              className={`text-2xl ${(value as number) >= rating ? "text-yellow-400" : "text-gray-300"}`}
            >
              ★
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
