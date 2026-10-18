import type { Dictionary } from "../index";

// What a field error from the server says, by its stable code (server/lib/validation.ts).
// A code missing here shows the server's English sentence instead.

const en = {
  err_required: "This field is required.",
  err_too_long: "Too long: at most {max} characters.",
  err_invalid_url: "Enter a full web address, starting with https://.",
  err_invalid_color: "Use a colour in the form #1a2b3c.",
  err_invalid_format: "This is not in the expected format.",
  err_invalid: "This value is not valid.",
  err_invalid_twilio_sid: "The Account SID starts with AC and has 34 characters.",
  err_invalid_twilio_mg_sid: "The Messaging Service SID starts with MG and has 34 characters.",
  err_invalid_e164: "Use the international format, e.g. +15085550100.",
  fieldAndMessage: "{field}: {message}",
  moreErrors_one: "{count} more field also needs fixing.",
  moreErrors_other: "{count} more fields also need fixing.",
};

export const apiErrorMessages: Dictionary<typeof en> = {
  en,
  pt: {
    err_required: "Este campo é obrigatório.",
    err_too_long: "Muito longo: no máximo {max} caracteres.",
    err_invalid_url: "Digite um endereço completo, começando com https://.",
    err_invalid_color: "Use uma cor no formato #1a2b3c.",
    err_invalid_format: "Isto não está no formato esperado.",
    err_invalid: "Este valor não é válido.",
    err_invalid_twilio_sid: "O Account SID começa com AC e tem 34 caracteres.",
    err_invalid_twilio_mg_sid: "O Messaging Service SID começa com MG e tem 34 caracteres.",
    err_invalid_e164: "Use o formato internacional, ex.: +15085550100.",
    fieldAndMessage: "{field}: {message}",
    moreErrors_one: "Mais {count} campo também precisa de correção.",
    moreErrors_other: "Mais {count} campos também precisam de correção.",
  },
  es: {
    err_required: "Este campo es obligatorio.",
    err_too_long: "Demasiado largo: como máximo {max} caracteres.",
    err_invalid_url: "Escribe una dirección completa, que empiece con https://.",
    err_invalid_color: "Usa un color con el formato #1a2b3c.",
    err_invalid_format: "No está en el formato esperado.",
    err_invalid: "Este valor no es válido.",
    err_invalid_twilio_sid: "El Account SID empieza con AC y tiene 34 caracteres.",
    err_invalid_twilio_mg_sid: "El Messaging Service SID empieza con MG y tiene 34 caracteres.",
    err_invalid_e164: "Usa el formato internacional, p. ej. +15085550100.",
    fieldAndMessage: "{field}: {message}",
    moreErrors_one: "{count} campo más también necesita corrección.",
    moreErrors_other: "{count} campos más también necesitan corrección.",
  },
};
