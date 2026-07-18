import {
  MessagesPage,
  type MessagesPageQuery,
} from "@/features/messages/components/messages-page";

export default async function CustomerMessagesRoute({
  searchParams,
}: {
  searchParams: Promise<MessagesPageQuery>;
}) {
  return <MessagesPage query={await searchParams} role="customer" />;
}
