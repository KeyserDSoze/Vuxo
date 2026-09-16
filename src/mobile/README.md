# Vuxo mobile

Questa cartella riserva il client React Native futuro.

Il renderer Phaser resta specifico del web. Logica condivisibile (contratti API, validazioni pure, modelli, versioning e client di rete) verrà estratta in `src/shared/` senza dipendenze DOM, così potrà essere riutilizzata da React Native. Non verrà forzato Phaser dentro React Native.
