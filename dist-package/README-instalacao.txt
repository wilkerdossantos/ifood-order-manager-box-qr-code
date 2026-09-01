iFood QR Service - v1.0.0
============================

INSTALACAO (maquina do cliente, sem Node.js):

1. Extraia este zip.
2. Abra PowerShell como Administrador na pasta extraida.
3. Rode:

     .\install.ps1 -TargetPrinter "NOME_DA_IMPRESSORA_TERMICA"

   (ex.: "EPSON TM-T88VII Receipt", "EPSON TM-T20", "Microsoft Print to PDF" para teste)

Isso instala o servico, a impressora virtual "iFood QR Bridge" e o atalho do
Gestor com debug. Requer internet apenas para baixar o NSSM (uma vez).

USO DIARIO:
- Feche o Gestor e abra por "Gestor de Pedidos.ifood-qr.lnk".
- Imprima na impressora "iFood QR Bridge".

VERIFICACAO:
- Health:  http://127.0.0.1:7420/health
- Logs:    C:\ProgramData\iFoodQrService\logs\
