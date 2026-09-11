/**
 * El saldo de una meta SALE DEL HISTORIAL, no se guarda suelto.
 *
 * `goals.current_amount` existía como un número independiente que cuatro
 * caminos escribían —crear la meta, PATCH, depositar, acreditar un movimiento—
 * mientras sólo dos de esos escribían una fila en `goal_deposits`. Los dos
 * números se separaban sin que nada lo notara, y la pantalla mostraba las dos
 * versiones a la vez: una meta al 12% con $5.827 ahorrados y, abajo, "Hacé tu
 * primer depósito para ver cuándo llegás". `calcProjection` lee los depósitos y
 * veía cero; el anillo lee el saldo y veía 5.827. Las dos cosas no pueden ser
 * ciertas.
 *
 * Ahora `current_amount` es una CACHÉ de `SUM(goal_deposits.amount)` y nada la
 * escribe a mano: cada camino que mueve plata inserta o borra su fila de
 * historial y después llama acá. Se mantiene la columna en vez de calcular la
 * suma en cada lectura porque la leen el anillo, la proyección, la cuota, los
 * hitos y la viabilidad, y todas tienen que ver el mismo número.
 *
 * `ejecutor` es `db` o un cliente adentro de una transacción — el borrado y la
 * acreditación necesitan que esto ocurra dentro del mismo BEGIN.
 */
async function recalcularSaldo(ejecutor, goalId) {
  const { rows } = await ejecutor.query(
    `UPDATE goals g
        SET current_amount = COALESCE(
              (SELECT SUM(amount) FROM goal_deposits WHERE goal_id = g.id), 0),
            is_completed = COALESCE(
              (SELECT SUM(amount) FROM goal_deposits WHERE goal_id = g.id), 0) >= g.target_amount
      WHERE g.id = $1
      RETURNING *`,
    [goalId],
  );
  return rows[0];
}

module.exports = { recalcularSaldo };
