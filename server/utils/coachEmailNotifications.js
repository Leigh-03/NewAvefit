async function deliverCoachEmail({ trainer, event, send }) {
  if (!trainer?.email) {
    console.error(`Coach ${event} email was not sent because coach ${trainer?.trainer_id ?? "unknown"} has no email address.`);
    return false;
  }

  try {
    const delivery = await send(trainer.email);
    if (!delivery.delivered) {
      console.error(`Coach ${event} email was not delivered to ${trainer.email}.`);
    }
    return Boolean(delivery.delivered);
  } catch (error) {
    console.error(`Coach ${event} email failed for ${trainer.email}:`, error.message);
    return false;
  }
}

module.exports = { deliverCoachEmail };
