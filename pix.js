// Gera o payload "Pix Copia e Cola" (BR Code / EMV) de um Pix estático.
(function () {
  function semAcentos(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function campo(id, valor) {
    const tamanho = String(valor.length).padStart(2, "0");
    return id + tamanho + valor;
  }

  function crc16(payload) {
    let crc = 0xffff;
    for (let i = 0; i < payload.length; i++) {
      crc ^= payload.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
        crc &= 0xffff;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }

  window.gerarPix = function ({ chave, nomeRecebedor, cidade, identificador, valor }) {
    const nome = semAcentos(nomeRecebedor).slice(0, 25);
    const cid = semAcentos(cidade).slice(0, 15);
    const id = semAcentos(identificador).replace(/[^A-Za-z0-9]/g, "").slice(0, 25);
    const txid = id || "***";

    let payload =
      campo("00", "01") +
      campo("26", campo("00", "br.gov.bcb.pix") + campo("01", String(chave).trim())) +
      campo("52", "0000") +
      campo("53", "986");
    if (valor && Number(valor) > 0) payload += campo("54", Number(valor).toFixed(2));
    payload +=
      campo("58", "BR") +
      campo("59", nome) +
      campo("60", cid) +
      campo("62", campo("05", txid)) +
      "6304";
    return payload + crc16(payload);
  };
})();
