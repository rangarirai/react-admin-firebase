import {
  doc,
  getFirestore,
  increment,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { log } from '../../misc';
import * as ra from '../../misc/react-admin-models';
import { FireClient } from '../database';

export async function Update<T extends ra.RaRecord>(
  resourceName: string,
  params: ra.UpdateParams,
  client: FireClient
): Promise<ra.UpdateResult<T>> {
  const { rm } = client;
  log('Update', { resourceName, params });
  const id = params.id + '';
  delete params.data.id;
  const r = await rm.TryGetResource(resourceName);
  log('Update', { resourceName, resource: r, params });
  const data = await client.parseDataAndUpload(r, id, params.data);
  const docObj = { ...data };
  client.checkRemoveIdField(docObj, id);
  await client.addUpdatedByFields(docObj);
  const docObjTransformed = client.transformToDb(resourceName, docObj, id);

  if (params?.meta?.custom) {
    let db = getFirestore();
    const batch = writeBatch(db);
    let productData = {};
    switch (params.meta.custom.page) {
      case 'purchases':
        productData = {
          totalCost: increment(-(+data.previousTotalCost - +data.totalCost)),
          totalQuantityPurchased: increment(
            -(+data.previousQuantity - +data.quantity)
          ),
          currentUnitCost: data.totalCost / data.quantity,
        };
        //delete
        delete docObjTransformed.previousTotalCost;
        delete docObjTransformed.previousQuantity;
        break;
      case 'sales':
        productData = {
          totalPrice: increment(-(+data.previousTotalPrice - +data.totalPrice)),
          totalQuantitySold: increment(
            -(data.previousQuantity - +data.quantity)
          ),
        };
        //delete
        delete docObjTransformed.previousTotalPrice;
        delete docObjTransformed.previousQuantity;
        break;
      case 'stockCheck':
        productData = {
          totalQuantityOffset: increment(
            -(+data.previousQuantityOffset - +data.quantityOffset)
          ),
        };
        //delete
        delete docObjTransformed.previousQuantityOffset;
        break;

      default:
        break;
    }

    batch.update(doc(db, `products`, data.productId), productData);
    batch.update(doc(r.collection, id), docObjTransformed);
    await batch.commit();

    return {
      data: {
        ...docObjTransformed,
        id: id,
      },
    };
  }
  await updateDoc(doc(r.collection, id), docObjTransformed);
  return {
    data: {
      ...data,
      id: id,
    },
  };
}
