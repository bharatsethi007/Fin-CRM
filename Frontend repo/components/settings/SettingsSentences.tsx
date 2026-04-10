import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { SentenceCategoryPanel } from './SentenceCategoryPanel';

type Props = { firmId: string };

/** Renders sentence bank tabs for reason, risk, and structure text. */
export function SettingsSentences({ firmId }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Sentence Library</h2>
      <Tabs defaultValue="reason">
        <TabsList>
          <TabsTrigger value="reason">Reason</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
          <TabsTrigger value="structure">Structure</TabsTrigger>
        </TabsList>
        <TabsContent value="reason"><SentenceCategoryPanel firmId={firmId} category="reason" /></TabsContent>
        <TabsContent value="risk"><SentenceCategoryPanel firmId={firmId} category="risk" /></TabsContent>
        <TabsContent value="structure"><SentenceCategoryPanel firmId={firmId} category="structure" /></TabsContent>
      </Tabs>
    </div>
  );
}
