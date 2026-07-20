import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "../../../lib/db/prisma";
import {
  createBusinessOperationsFixture,
  createFutureRestaurantBooking,
  resetBusinessOperationsTestData,
} from "../helpers/business-operations-fixture";

const baseUrl = process.env.COMMERCE_HTTP_BASE_URL;

function decodeHtml(value: string) {
  return value.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

function attribute(element: string, name: string) {
  return decodeHtml(element.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? "");
}

function forms(html: string) {
  return html.match(/<form\b[\s\S]*?<\/form>/g) ?? [];
}

function formParams(form: string) {
  const parameters = new URLSearchParams();
  for (const input of form.match(/<input\b[^>]*>/g) ?? []) {
    const name = attribute(input, "name");
    if (!name || (input.includes('type="checkbox"') && !input.includes(" checked"))) continue;
    parameters.append(name, attribute(input, "value"));
  }
  return parameters;
}

async function signUp(label: string) {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    body: JSON.stringify({
      email: `stage2c-${label}-${randomUUID().slice(0, 8)}@rezno.invalid`,
      name: label,
      password: "password123",
    }),
    headers: { "content-type": "application/json", origin: baseUrl! },
    method: "POST",
  });
  assert.equal(response.status, 200);
  const payload = await response.json() as { user: { id: string } };
  const cookie = response.headers.getSetCookie().find((value) => value.includes("session_token="));
  assert.ok(cookie);
  return {
    cookie: cookie.split(";")[0]!,
    person: await prisma.person.update({
      where: { authUserId: payload.user.id },
      data: { isOnboarded: true, phone: "+9647500000030", status: "ACTIVE" },
    }),
  };
}

function activeCookie(cookie: string, organizationId: string) {
  return `${cookie}; rezno-active-business-id=${organizationId}`;
}

async function page(path: string, cookie?: string, rsc = false) {
  return fetch(`${baseUrl}${path}`, {
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(rsc ? { accept: "text/x-component", rsc: "1" } : {}),
    },
    redirect: "manual",
  });
}

async function submit(
  path: string,
  form: string,
  mutate: (parameters: URLSearchParams) => void,
  cookie: string,
  readBody = false,
) {
  const parameters = formParams(form);
  mutate(parameters);
  const body = new FormData();
  for (const [key, value] of parameters) body.append(key, value);
  const response = await fetch(`${baseUrl}${path}`, {
    body,
    headers: { cookie, origin: baseUrl!, referer: `${baseUrl}${path}` },
    method: "POST",
    redirect: "manual",
  });
  assert.ok([200, 303].includes(response.status), `Unexpected action status ${response.status}`);
  let responseBody = "";
  if (readBody && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const result = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value?: undefined }>((resolve) =>
          setTimeout(() => resolve({ done: true }), 500),
        ),
      ]);
      if (result.done) break;
      responseBody += decoder.decode(result.value, { stream: true });
    }
    await reader.cancel();
  } else {
    await response.body?.cancel();
  }
  return { body: responseBody, status: response.status };
}

function instant(days: number, hour: number, minute = 0) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  value.setUTCHours(hour, minute, 0, 0);
  return value;
}

test("Stage 2C production Business Web HTML, RSC and Server Actions enforce daily-operation contracts", {
  concurrency: false,
  skip: baseUrl ? false : "COMMERCE_HTTP_BASE_URL is required for live Stage 2C tests",
}, async (t) => {
  await resetBusinessOperationsTestData();
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await resetBusinessOperationsTestData();
    await prisma.$disconnect();
  });
  const fixture = await createBusinessOperationsFixture("stage2c-http");
  const session = await signUp("daily-owner");
  await prisma.organizationMember.updateMany({
    where: { id: { in: [fixture.owner.membership.id, fixture.ownerB.membership.id] } },
    data: { personId: session.person.id },
  });
  await prisma.branchAssignment.create({
    data: { branchId: fixture.activeBranch.id, memberId: fixture.owner.membership.id },
  });
  const ownerCookie = activeCookie(session.cookie, fixture.organizationA.id);
  const foreignCookie = activeCookie(session.cookie, fixture.organizationB.id);
  const startsAt = instant(4, 10);
  const ownBooking = await prisma.booking.create({
    data: {
      branchId: fixture.activeBranch.id,
      branchServiceId: fixture.offering.id,
      customerId: fixture.customer.id,
      customerNameSnapshot: "HTTP_STAFF_OWN_CUSTOMER",
      endsAt: instant(4, 10, 30),
      memberId: fixture.owner.membership.id,
      notes: "HTTP customer service note",
      organizationId: fixture.organizationA.id,
      priceSnapshot: "25000",
      serviceNameSnapshot: "HTTP own service",
      startsAt,
      status: "PENDING",
    },
  });
  const otherBooking = await prisma.booking.create({
    data: {
      branchId: fixture.activeBranch.id,
      branchServiceId: fixture.offering.id,
      customerId: fixture.customer.id,
      customerNameSnapshot: "HTTP_OTHER_EMPLOYEE_SENTINEL",
      endsAt: instant(4, 11, 30),
      memberId: fixture.manager.membership.id,
      organizationId: fixture.organizationA.id,
      priceSnapshot: "25000",
      serviceNameSnapshot: "HTTP other service",
      startsAt: instant(4, 11),
      status: "CONFIRMED",
    },
  });
  const restaurant = await createFutureRestaurantBooking(
    fixture,
    instant(5, 0).toISOString().slice(0, 10),
  );

  await t.test("Owner and Manager receive operational calendar/detail HTML and RSC", async () => {
    const path = "/business/calendar?view=upcoming";
    const ownerResponse = await page(path, ownerCookie);
    assert.equal(ownerResponse.status, 200);
    const ownerHtml = await ownerResponse.text();
    for (const sentinel of [fixture.organizationA.name, ownBooking.id, otherBooking.id, restaurant.id, fixture.customer.phone!]) {
      assert.equal(ownerHtml.includes(sentinel), true, `Owner HTML omitted ${sentinel}`);
    }
    assert.match(ownerHtml, /name="expectedVersion"/);
    assert.match(ownerHtml, /name="idempotencyKey"/);
    const ownerRsc = await page(path, ownerCookie, true);
    assert.equal(ownerRsc.status, 200);
    assert.match(ownerRsc.headers.get("content-type") ?? "", /text\/x-component/);
    const ownerRscBody = await ownerRsc.text();
    assert.match(ownerRscBody, new RegExp(ownBooking.id));
    assert.match(ownerRscBody, new RegExp(restaurant.id));
    const detail = await page(`/business/bookings/${ownBooking.id}`, ownerCookie);
    assert.equal(detail.status, 200);
    const detailBody = await detail.text();
    assert.match(detailBody, /بيانات العميل التشغيلية/);
    assert.equal(detailBody.includes(fixture.customer.phone!), true);
    await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { roleId: fixture.manager.membership.roleId } });
    try {
      const managerHtml = await (await page(path, ownerCookie)).text();
      assert.match(managerHtml, new RegExp(ownBooking.id));
      assert.match(managerHtml, /MANAGEMENT/);
    } finally {
      await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { roleId: fixture.owner.membership.roleId } });
    }
  });

  await t.test("Receptionist active-Branch scope and Staff HTML/RSC privacy are structural", async () => {
    const inactiveOffering = await prisma.branchService.create({
      data: { branchId: fixture.inactiveBranch.id, durationMinutes: 30, price: "10", serviceId: fixture.service.id },
    });
    const inactiveBooking = await prisma.booking.create({
      data: {
        branchId: fixture.inactiveBranch.id,
        branchServiceId: inactiveOffering.id,
        customerId: fixture.customer.id,
        customerNameSnapshot: "HTTP_INACTIVE_BRANCH_SENTINEL",
        endsAt: instant(6, 10, 30),
        organizationId: fixture.organizationA.id,
        priceSnapshot: "10",
        serviceNameSnapshot: "Inactive",
        startsAt: instant(6, 10),
        status: "CONFIRMED",
      },
    });
    try {
      await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { roleId: fixture.receptionist.membership.roleId } });
      const receptionist = await (await page("/business/calendar?view=upcoming", ownerCookie)).text();
      assert.match(receptionist, new RegExp(ownBooking.id));
      assert.equal(receptionist.includes(inactiveBooking.id), false);
      assert.equal(receptionist.includes("/business/messages"), false);

      await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { roleId: fixture.staff.membership.roleId } });
      const staffHtml = await (await page("/business/calendar?view=upcoming", ownerCookie)).text();
      assert.match(staffHtml, new RegExp(ownBooking.id));
      for (const sentinel of [
        otherBooking.id,
        restaurant.id,
        inactiveBooking.id,
        fixture.customer.phone!,
      ]) {
        assert.equal(staffHtml.includes(sentinel), false, `Staff HTML leaked ${sentinel}`);
      }
      assert.equal(
        forms(staffHtml).some((form) =>
          form.includes('name="nextStatus"') ||
          form.includes('name="expectedVersion"') ||
          form.includes('name="idempotencyKey"')
        ),
        false,
        "Staff HTML exposed a booking mutation form",
      );
      const staffRsc = await page("/business/calendar?view=upcoming", ownerCookie, true);
      const staffRscBody = await staffRsc.text();
      assert.match(staffRscBody, new RegExp(ownBooking.id));
      for (const sentinel of [
        otherBooking.id,
        restaurant.id,
        fixture.customer.phone!,
      ]) {
        assert.equal(staffRscBody.includes(sentinel), false, `Staff RSC leaked ${sentinel}`);
      }
      const selfDetail = await (await page(`/business/bookings/${ownBooking.id}`, ownerCookie)).text();
      assert.match(selfDetail, /أجندتك الذاتية للموعد/);
      assert.match(selfDetail, new RegExp(ownBooking.id));
      assert.equal(selfDetail.includes(fixture.customer.phone!), false);
      const forgedDetail = await (await page(`/business/bookings/${otherBooking.id}`, ownerCookie)).text();
      assert.match(forgedDetail, /NEXT_HTTP_ERROR_FALLBACK;404/);
    } finally {
      await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { roleId: fixture.owner.membership.roleId } });
    }
  });

  await t.test("status, stale-form and cross-tenant Server Actions persist only authoritative state", async () => {
    const path = "/business/calendar?view=upcoming";
    const html = await (await page(path, ownerCookie)).text();
    const confirmForm = forms(html).find((form) => form.includes('name="nextStatus" value="CONFIRMED"'));
    assert.ok(confirmForm);
    await submit(path, confirmForm, () => {}, ownerCookie);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: ownBooking.id } })).status, "CONFIRMED");
    const auditCount = await prisma.businessAuditLog.count({ where: { targetId: ownBooking.id } });
    await submit(path, confirmForm, (parameters) => {
      parameters.set("idempotencyKey", randomUUID());
    }, ownerCookie);
    assert.equal(await prisma.businessAuditLog.count({ where: { targetId: ownBooking.id } }), auditCount);

    const fresh = await (await page(path, ownerCookie)).text();
    const cancellationForm = forms(fresh).find((form) => form.includes('name="nextStatus" value="CANCELLED"'));
    assert.ok(cancellationForm);
    const beforeForeign = await prisma.booking.findUniqueOrThrow({ where: { id: ownBooking.id } });
    await submit(path, cancellationForm, (parameters) => {
      parameters.set("cancellationReason", "Forged foreign action");
      parameters.set("idempotencyKey", randomUUID());
    }, foreignCookie);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: ownBooking.id } })).updatedAt.getTime(), beforeForeign.updatedAt.getTime());
    await submit(path, cancellationForm, (parameters) => {
      parameters.set("cancellationReason", "HTTP customer-visible cancellation");
    }, ownerCookie);
    const cancelled = await prisma.booking.findUniqueOrThrow({ where: { id: ownBooking.id } });
    assert.equal(cancelled.status, "CANCELLED");
    assert.equal(cancelled.cancellationReason, "HTTP customer-visible cancellation");
  });

  await t.test("generic change response, Restaurant reschedule, tables and menu run through real forms", async () => {
    const service = await prisma.service.create({
      data: { categoryId: fixture.category.id, name: "HTTP Generic B", organizationId: fixture.organizationB.id, staffSelectionMode: "NONE" },
    });
    const offering = await prisma.branchService.create({
      data: { branchId: fixture.branchB.id, durationMinutes: 30, price: "100", serviceId: service.id },
    });
    const generic = await prisma.booking.create({
      data: {
        branchId: fixture.branchB.id,
        branchServiceId: offering.id,
        customerId: fixture.customer.id,
        customerNameSnapshot: "HTTP Change Customer",
        endsAt: instant(7, 10, 30),
        organizationId: fixture.organizationB.id,
        priceSnapshot: "100",
        serviceNameSnapshot: service.name,
        startsAt: instant(7, 10),
        status: "CONFIRMED",
      },
    });
    const request = await prisma.bookingChangeRequest.create({
      data: {
        bookingId: generic.id,
        bookingUpdatedAtSnapshot: generic.updatedAt,
        proposedEndsAt: instant(7, 12, 30),
        proposedStartsAt: instant(7, 12),
        requestedByPersonId: fixture.customer.id,
      },
    });
    const detailPath = `/business/bookings/${generic.id}`;
    const detailHtml = await (await page(detailPath, foreignCookie)).text();
    const acceptForm = forms(detailHtml).find((form) => form.includes('name="decision" value="accept"') && form.includes(request.id));
    assert.ok(acceptForm);
    await submit(detailPath, acceptForm, () => {}, foreignCookie);
    assert.equal((await prisma.bookingChangeRequest.findUniqueOrThrow({ where: { id: request.id } })).status, "ACCEPTED");

    const restaurantPath = `/business/reservations/${restaurant.id}`;
    const restaurantHtml = await (await page(restaurantPath, ownerCookie)).text();
    assert.match(restaurantHtml, /لقطات الطلب المسبق/);
    const rescheduleForm = forms(restaurantHtml).find((form) => form.includes('name="expectedReservationVersion"') && form.includes('name="guestCount"'));
    assert.ok(rescheduleForm);
    await submit(restaurantPath, rescheduleForm, (parameters) => {
      parameters.set("date", instant(8, 0).toISOString().slice(0, 10));
      parameters.set("time", "12:00");
      parameters.set("guestCount", "2");
      parameters.set("seatingArea", "");
      parameters.set("tableId", fixture.table.id);
      parameters.set("customerNote", "HTTP restaurant update");
    }, ownerCookie);
    assert.equal((await prisma.restaurantReservationDetails.findUniqueOrThrow({ where: { bookingId: restaurant.id } })).customerNote, "HTTP restaurant update");

    const tablesPath = "/business/tables?create=table";
    const tablesHtml = await (await page(tablesPath, ownerCookie)).text();
    const tableCreate = forms(tablesHtml).find((form) => form.includes('name="capacity"') && !form.includes('name="expectedVersion"'));
    assert.ok(tableCreate);
    assert.equal(tableCreate.includes('name="branchId"'), true);
    await submit(tablesPath, tableCreate, (parameters) => {
      parameters.set("name", "HTTP Table");
      parameters.set("code", "HT1");
      parameters.set("capacity", "6");
      parameters.set("branchId", fixture.activeBranch.id);
      parameters.set("area", "Main");
      parameters.set("floor", "1");
      parameters.set("positionLabel", "Door");
    }, ownerCookie);
    assert.equal(await prisma.restaurantTable.count({ where: { businessId: fixture.organizationA.id, name: "HTTP Table" } }), 1);
    const httpTable = await prisma.restaurantTable.findFirstOrThrow({
      where: { businessId: fixture.organizationA.id, name: "HTTP Table" },
    });
    const branchB = await prisma.branch.create({
      data: {
        name: "HTTP Second Restaurant Branch",
        organizationId: fixture.organizationA.id,
        slug: "http-second-restaurant",
        status: "ACTIVE",
        timezone: "UTC",
      },
    });
    const protectedStartsAt = instant(10, 16);
    const protectedReservation = await prisma.booking.create({
      data: {
        branchId: fixture.activeBranch.id,
        customerId: fixture.customer.id,
        customerNameSnapshot: "HTTP Table Integrity Customer",
        endsAt: new Date(protectedStartsAt.getTime() + 90 * 60_000),
        organizationId: fixture.organizationA.id,
        priceSnapshot: "0",
        restaurantReservation: {
          create: {
            branchId: fixture.activeBranch.id,
            businessId: fixture.organizationA.id,
            durationMinutes: 90,
            guestCount: 5,
            reservationDateTime: protectedStartsAt,
            tableId: httpTable.id,
          },
        },
        serviceNameSnapshot: "HTTP protected reservation",
        startsAt: protectedStartsAt,
        status: "CONFIRMED",
      },
      include: { restaurantReservation: true },
    });
    const tableEditPath = `/business/tables?edit=${httpTable.id}`;
    const freshTablesHtml = await (await page(tableEditPath, ownerCookie)).text();
    const tableEdit = forms(freshTablesHtml).find(
      (form) => form.includes('name="expectedVersion"') && form.includes('value="HTTP Table"'),
    );
    assert.ok(tableEdit);
    assert.equal(tableEdit.includes('name="branchId"'), false);
    assert.equal(tableEdit.includes("لا يمكن نقل الطاولة إلى فرع آخر بعد إنشائها"), true);
    const deniedAuditCount = await prisma.businessAuditLog.count({
      where: { organizationId: fixture.organizationA.id },
    });
    const deniedMutationCount = await prisma.businessOperationMutation.count({
      where: { organizationId: fixture.organizationA.id },
    });
    const forgedBranchResult = await submit(tableEditPath, tableEdit, (parameters) => {
      parameters.set("branchId", branchB.id);
      parameters.set("idempotencyKey", randomUUID());
    }, ownerCookie, true);
    assert.match(forgedBranchResult.body, /INVALID_REQUEST|بيانات الطاولة غير صالحة/);
    assert.doesNotMatch(forgedBranchResult.body, /Prisma|PostgreSQL|numeric field overflow/i);
    const insufficientCapacityResult = await submit(tableEditPath, tableEdit, (parameters) => {
      parameters.set("capacity", "4");
      parameters.set("idempotencyKey", randomUUID());
    }, ownerCookie, true);
    assert.match(insufficientCapacityResult.body, /TABLE_RESERVATION_CONFLICT|Increase table capacity/);
    assert.doesNotMatch(insufficientCapacityResult.body, /Prisma|PostgreSQL|numeric field overflow/i);
    const afterDeniedTable = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: httpTable.id } });
    const afterDeniedReservation = await prisma.booking.findUniqueOrThrow({
      where: { id: protectedReservation.id },
      include: { restaurantReservation: true },
    });
    assert.equal(afterDeniedTable.branchId, fixture.activeBranch.id);
    assert.equal(afterDeniedTable.capacity, 6);
    assert.equal(afterDeniedReservation.branchId, fixture.activeBranch.id);
    assert.equal(afterDeniedReservation.restaurantReservation?.branchId, fixture.activeBranch.id);
    assert.equal(afterDeniedReservation.restaurantReservation?.tableId, httpTable.id);
    assert.equal(await prisma.businessAuditLog.count({ where: { organizationId: fixture.organizationA.id } }), deniedAuditCount);
    assert.equal(await prisma.businessOperationMutation.count({ where: { organizationId: fixture.organizationA.id } }), deniedMutationCount);
    const detailAfterDenied = await page(`/business/reservations/${protectedReservation.id}`, ownerCookie);
    assert.equal(detailAfterDenied.status, 200);
    assert.match(await detailAfterDenied.text(), /HTTP Table/);

    await submit(tableEditPath, tableEdit, (parameters) => {
      parameters.set("capacity", "7");
      parameters.set("idempotencyKey", randomUUID());
      parameters.set("name", "HTTP Table Owner Updated");
    }, ownerCookie);
    assert.deepEqual(
      await prisma.restaurantTable.findUniqueOrThrow({
        where: { id: httpTable.id },
        select: { capacity: true, name: true },
      }),
      { capacity: 7, name: "HTTP Table Owner Updated" },
    );
    const managerTablesHtml = await (await page(tableEditPath, ownerCookie)).text();
    const managerEdit = forms(managerTablesHtml).find(
      (form) => form.includes('name="expectedVersion"') && form.includes('value="HTTP Table Owner Updated"'),
    );
    assert.ok(managerEdit);
    await prisma.organizationMember.update({
      where: { id: fixture.owner.membership.id },
      data: { roleId: fixture.manager.membership.roleId },
    });
    await submit(tableEditPath, managerEdit, (parameters) => {
      parameters.set("capacity", "8");
      parameters.set("idempotencyKey", randomUUID());
      parameters.set("name", "HTTP Table Manager Updated");
    }, ownerCookie);
    assert.deepEqual(
      await prisma.restaurantTable.findUniqueOrThrow({
        where: { id: httpTable.id },
        select: { capacity: true, name: true },
      }),
      { capacity: 8, name: "HTTP Table Manager Updated" },
    );
    const receptionistFormHtml = await (await page(tableEditPath, ownerCookie)).text();
    const receptionistForgedEdit = forms(receptionistFormHtml).find(
      (form) => form.includes('name="expectedVersion"') && form.includes('value="HTTP Table Manager Updated"'),
    );
    assert.ok(receptionistForgedEdit);
    await prisma.organizationMember.update({
      where: { id: fixture.owner.membership.id },
      data: { roleId: fixture.receptionist.membership.roleId },
    });
    const beforeReceptionist = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: httpTable.id } });
    const receptionistResult = await submit(tableEditPath, receptionistForgedEdit, (parameters) => {
      parameters.set("capacity", "9");
      parameters.set("idempotencyKey", randomUUID());
    }, ownerCookie, true);
    assert.match(receptionistResult.body, /FORBIDDEN|cannot perform/i);
    assert.equal(
      (await prisma.restaurantTable.findUniqueOrThrow({ where: { id: httpTable.id } })).updatedAt.getTime(),
      beforeReceptionist.updatedAt.getTime(),
    );
    await prisma.organizationMember.update({
      where: { id: fixture.owner.membership.id },
      data: { roleId: fixture.owner.membership.roleId },
    });

    const menuPath = "/business/menu?create=category";
    const menuHtml = await (await page(menuPath, ownerCookie)).text();
    const categoryCreate = forms(menuHtml).find((form) => form.includes('name="sortOrder"') && form.includes('name="description"') && !form.includes('name="menuCategoryId"'));
    assert.ok(categoryCreate);
    await submit(menuPath, categoryCreate, (parameters) => {
      parameters.set("name", "HTTP Category");
      parameters.set("description", "Created live");
      parameters.set("sortOrder", "5");
    }, ownerCookie);
    assert.equal(await prisma.menuCategory.count({ where: { businessId: fixture.organizationA.id, name: "HTTP Category" } }), 1);
    const itemMenuPath = "/business/menu?create=item";
    const itemMenuHtml = await (await page(itemMenuPath, ownerCookie)).text();
    const itemCreate = forms(itemMenuHtml).find(
      (form) => form.includes('name="menuCategoryId"') && form.includes('name="price"') && !form.includes('name="expectedVersion"'),
    );
    assert.ok(itemCreate);
    const httpCategory = await prisma.menuCategory.findFirstOrThrow({
      where: { businessId: fixture.organizationA.id, name: "HTTP Category" },
    });
    await submit(itemMenuPath, itemCreate, (parameters) => {
      parameters.set("currency", "IQD");
      parameters.set("description", "Maximum valid Decimal");
      parameters.set("menuCategoryId", httpCategory.id);
      parameters.set("name", "HTTP Maximum Price");
      parameters.set("preparationMinutes", "");
      parameters.set("price", "99999999.99");
      parameters.set("sortOrder", "1");
    }, ownerCookie);
    assert.equal(
      (await prisma.menuItem.findFirstOrThrow({ where: { name: "HTTP Maximum Price" } })).price.toString(),
      "99999999.99",
    );
    const overflowLedgerCount = await prisma.businessOperationMutation.count({
      where: { organizationId: fixture.organizationA.id },
    });
    const overflowResult = await submit(itemMenuPath, itemCreate, (parameters) => {
      parameters.set("currency", "IQD");
      parameters.set("description", "Overflow must fail validation");
      parameters.set("idempotencyKey", randomUUID());
      parameters.set("menuCategoryId", httpCategory.id);
      parameters.set("name", "HTTP Overflow Price");
      parameters.set("preparationMinutes", "");
      parameters.set("price", "100000000");
      parameters.set("sortOrder", "2");
    }, ownerCookie, true);
    assert.match(overflowResult.body, /INVALID_REQUEST|بيانات الصنف غير صالحة/);
    assert.doesNotMatch(overflowResult.body, /Prisma|PostgreSQL|numeric field overflow/i);
    assert.equal(await prisma.menuItem.count({ where: { name: "HTTP Overflow Price" } }), 0);
    assert.equal(await prisma.businessOperationMutation.count({ where: { organizationId: fixture.organizationA.id } }), overflowLedgerCount);
  });
});
