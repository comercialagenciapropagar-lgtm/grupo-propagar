// Helpers de validacao de entrada.

// WhatsApp: aceita apenas digitos, 10-15 chars.
// Em pt-BR tipicamente 5548999998888 (13 digitos) ou 48999998888 (11).
function validarWhatsapp(whatsapp) {
  if (!whatsapp) return false;
  const digits = String(whatsapp).replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

// CPF: 11 digitos + validacao dos digitos verificadores.
function validarCpf(cpf) {
  if (!cpf) return false;
  const d = String(cpf).replace(/\D/g, '');
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false; // rejeita 00000000000, 11111111111...

  const calc = (base, pesoInicial) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += parseInt(base[i], 10) * (pesoInicial - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const dig1 = calc(d.substring(0, 9), 10);
  if (dig1 !== parseInt(d[9], 10)) return false;
  const dig2 = calc(d.substring(0, 10), 11);
  if (dig2 !== parseInt(d[10], 10)) return false;
  return true;
}

module.exports = { validarWhatsapp, validarCpf };
