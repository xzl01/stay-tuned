/* SPDX-License-Identifier: GPL-3.0-only */

import { formBindingData, formProvider, FormExtensionAbility } from '@kit.FormKit';
import { Want } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN: number = 0x0000;
const TAG: string = 'StayTunedForm';
const SNAPSHOT_STORE: string = 'stay_tuned_now';
const FORM_STORE: string = 'stay_tuned_forms';

interface CardData {
  title: string;
  artist: string;
  playing: boolean;
}

/** Reads the snapshot the media host keeps up to date while playing. */
async function readSnapshot(context: Context): Promise<CardData> {
  try {
    const store = await preferences.getPreferences(context, { name: SNAPSHOT_STORE });
    const title = await store.get('title', '留频') as string;
    const artist = await store.get('artist', '还没有在收听') as string;
    const playing = await store.get('playing', false) as boolean;
    return { title: title, artist: artist, playing: playing };
  } catch (error) {
    const failure = error as BusinessError;
    hilog.warn(DOMAIN, TAG, 'snapshot read failed: %{public}s', JSON.stringify(failure));
    return { title: '留频', artist: '还没有在收听', playing: false };
  }
}

async function rememberForm(context: Context, formId: string, add: boolean): Promise<void> {
  try {
    const store = await preferences.getPreferences(context, { name: FORM_STORE });
    const raw = await store.get('ids', '') as string;
    const ids = raw.length > 0 ? raw.split(',') : [];
    const next = add
      ? (ids.includes(formId) ? ids : ids.concat([formId]))
      : ids.filter((item: string) => item !== formId);
    await store.put('ids', next.join(','));
    await store.flush();
  } catch (error) {
    const failure = error as BusinessError;
    hilog.warn(DOMAIN, TAG, 'form id bookkeeping failed: %{public}s', JSON.stringify(failure));
  }
}

export default class EntryFormAbility extends FormExtensionAbility {
  onAddForm(want: Want): formBindingData.FormBindingData {
    const parameters = want.parameters;
    const formId = parameters ? String(parameters[formBindingData.FormParam.IDENTITY_KEY] ?? '') : '';
    if (formId) {
      rememberForm(this.context, formId, true).catch(() => undefined);
      // onAddForm must answer synchronously, so hand back the placeholder and
      // replace it with the live snapshot as soon as it is read.
      readSnapshot(this.context)
        .then((data: CardData) => formProvider.updateForm(formId, formBindingData.createFormBindingData(data)))
        .catch(() => undefined);
    }
    const placeholder: CardData = { title: '留频', artist: '还没有在收听', playing: false };
    return formBindingData.createFormBindingData(placeholder);
  }

  onUpdateForm(formId: string): void {
    readSnapshot(this.context)
      .then((data: CardData) => formProvider.updateForm(formId, formBindingData.createFormBindingData(data)))
      .catch(() => undefined);
  }

  onRemoveForm(formId: string): void {
    rememberForm(this.context, formId, false).catch(() => undefined);
  }
}
