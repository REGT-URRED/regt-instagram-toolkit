import type { TranslationDictionary } from '../types.js';

export const defaultTranslations = {
  select: ['Select', 'Seleccionar'],
  unlike: ['Unlike', 'Ya no me gusta'],
  delete: ['Delete', 'Eliminar'],
  confirm: ['Confirm', 'Confirmar'],
  remove: ['Remove', 'Quitar'],
  sort: ['Sort', 'Ordenar'],
  filter: ['Filter', 'Filtrar'],
  sortFilter: ['Sort & filter', 'Sort and filter', 'Ordenar y filtrar'],
  apply: ['Apply', 'Aplicar'],
  done: ['Done', 'Listo'],
  cancel: ['Cancel', 'Cancelar'],
  options: ['Options', 'More options', 'Opciones', 'Más opciones'],
  block: ['Block', 'Bloquear'],
  unblock: ['Unblock', 'Desbloquear'],
  doneNotification: ["That's all, we're done.", 'Eso es todo amigo, ya terminamos.'],
  likesCleanupToast: [
    'You unliked {{count}} post',
    'You unliked {{count}} posts',
    'Ya no te gusta {{count}} publicación',
    'Ya no te gustan {{count}} publicaciones',
  ],
  commentsCleanupToast: [
    'You deleted {{count}} comment',
    'You deleted {{count}} comments',
    'You removed {{count}} comment',
    'You removed {{count}} comments',
    'Eliminaste {{count}} comentario',
    'Eliminaste {{count}} comentarios',
    'Quitaste {{count}} comentario',
    'Quitaste {{count}} comentarios',
  ],
} satisfies TranslationDictionary;

export const controlTranslationKeys = [
  'select',
  'unlike',
  'delete',
  'confirm',
  'remove',
  'sort',
  'filter',
  'sortFilter',
  'apply',
  'done',
  'cancel',
] satisfies Array<keyof typeof defaultTranslations>;
