import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Truck, Calculator, MapIcon, Info, Factory, BarChart3, Building } from 'lucide-react';
import { FilterDropdown, useTableSearch } from './App';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useLocalStorage } from './useSyncedStorage';

const initialFleetData = [
  { id: 'kia', name: 'Kia Local Carrier', capacity: 8, tripsPerMonth: 4, total: 9, desc: 'Load for south zone, return to kia plant', zone: 'South', plant: 'Erramanchi', isLocal: true },
  { id: 'west-gj', name: 'West GJ Export Carrier', capacity: 8, tripsPerMonth: 5, total: 17, desc: 'Bechraji to export only', zone: 'West - GJ', plant: 'SMG', isLocal: true },
  { id: 'mh-gj', name: 'MH-GJ Local Carrier', capacity: 8, tripsPerMonth: 4, total: 20, desc: 'West GJ to West MH and vice versa', zone: 'West - GJ', plant: 'All', isLocal: true },
  { id: 'north', name: 'North Local Carrier', capacity: 8, tripsPerMonth: 5, total: 18, desc: 'North zone all OEM to north zone dest', zone: 'North', plant: 'All', isLocal: true },
  { id: 'pune', name: 'Pune Local Carrier', capacity: 8, tripsPerMonth: 5, total: 20, desc: 'West MH zone OEM plant Pune, Chakan', zone: 'West - MH', plant: 'Pune', isLocal: true },
  { id: 'tata', name: 'TATA Green Corridor', capacity: 8, tripsPerMonth: 4, total: 10, desc: 'TATA Sanand to Tata Pune & vice versa', zone: 'West - GJ', plant: 'Sanand', isLocal: true },
  { id: 'curtain', name: 'Curtain Trailer', capacity: 8, tripsPerMonth: 5, total: 88, desc: 'Lifting all zone cars', zone: 'All', plant: 'All', isLocal: false },
  { id: 'truck', name: 'Truck', capacity: 4, tripsPerMonth: 4, total: 33, desc: 'Lifting from North, West GJ & MH', zone: 'All', plant: 'All', isLocal: false },
  { id: 'tvpb', name: 'TVPB Local carrier', capacity: 8, tripsPerMonth: 5, total: 20, desc: 'TVPB Plant to all zone sob only', zone: 'South', plant: 'TVP Bangalore', isLocal: true },
  { id: 'wo-curtain', name: 'W/O Curtain trailer', capacity: 8, tripsPerMonth: 5, total: 139, desc: 'Lifting all zone cars', zone: 'All', plant: 'All', isLocal: false },
];

export const FleetPlanner = ({ data = [], oems = [], plants = [], oemPlantMap = {}, plantDestMap = {}, getDestinationZone = (d: string) => d, getOriginZone = (p: string) => p, globalYear, globalTimeframe, globalOEM, globalPlant, getMonthsForTimeframe, destZones = [], plannerOriginZone, setPlannerOriginZone, plannerOEM, setPlannerOEM, plannerPlant, setPlannerPlant, plannerBranch, setPlannerBranch, plannerFilteredZones, plannerFilteredOEMs, plannerFilteredPlants, plannerFilteredBranches, transportName }: any) => {
  const FLEET_STORAGE_KEY = 'tracker_fleet_data';
  const [fleetData, setFleetData] = useLocalStorage(FLEET_STORAGE_KEY, initialFleetData);
  const [selectedTrailerId, setSelectedTrailerId] = useState<string | null>(null);
  const [carsToLift, setCarsToLift] = useState<number | ''>('');
  const [localTrailersAvailable, setLocalTrailersAvailable] = useState<number | ''>('');
  const [localTrailerSources, setLocalTrailerSources] = useState<string>('');
  const [manualCapacity, setManualCapacity] = useState<number | ''>('');
  const [manualTrips, setManualTrips] = useState<number | ''>('');
  
  const fleetSearch = useTableSearch();
  
  const [plannerDestZone, setPlannerDestZone] = useState<string>('All');

  const selectedTrailer = fleetData.find(t => t.id === selectedTrailerId);

  // Dynamic plants based on selected OEM
  const activePlants = React.useMemo(() => {
    if (globalOEM === 'All') return plants;
    return oemPlantMap[globalOEM] || [];
  }, [globalOEM, oemPlantMap, plants]);


  // Update manual inputs when a trailer is selected
  useEffect(() => {
    if (selectedTrailer) {
      setManualCapacity(selectedTrailer.capacity);
      setManualTrips(selectedTrailer.tripsPerMonth);
    }
  }, [selectedTrailer]);

  // Auto-calculate cars to lift based on filters
  useEffect(() => {
    if (globalOEM !== 'All' || plannerDestZone !== 'All' || plannerOriginZone !== 'All' || globalPlant !== 'All' || globalYear || globalTimeframe) {
      const activeMonths = getMonthsForTimeframe ? getMonthsForTimeframe(globalTimeframe) : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      const filteredData = data.filter((d: any) => 
        (d.year === globalYear) &&
        (activeMonths.includes(d.month)) &&
        (globalOEM === 'All' || d.oem === globalOEM) &&
        (plannerDestZone === 'All' || getDestinationZone(d) === plannerDestZone) &&
        (plannerOriginZone === 'All' || getOriginZone(d.plant) === plannerOriginZone) &&
        (globalPlant === 'All' || d.plant === globalPlant)
      );
      
      const totalTarget = filteredData.reduce((sum: number, d: any) => sum + d.target, 0);
      setCarsToLift(totalTarget);

      // Auto-fill local trailers
      let localCount = 0;
      let sources: string[] = [];
      fleetData.forEach(t => {
        if (t.isLocal) {
          let match = false;
          if (globalPlant !== 'All') {
            const plantZone = getOriginZone(globalPlant);
            if (t.plant === globalPlant || t.name.toLowerCase().includes(globalPlant.toLowerCase())) {
               match = true;
            } else if (t.plant === 'All' && t.zone === plantZone) {
               match = true;
            }
          } else if (plannerOriginZone !== 'All') {
            if (t.zone === plannerOriginZone) match = true;
          }
          
          if (match) {
            localCount += t.total;
            sources.push(`${t.total} ${t.name}`);
          }
        }
      });
      
      if (localCount > 0) {
        setLocalTrailersAvailable(localCount);
        setLocalTrailerSources(sources.join(', '));
      } else if (plannerOriginZone !== 'All' || globalPlant !== 'All') {
        setLocalTrailersAvailable('');
        setLocalTrailerSources('');
      } else {
        setLocalTrailerSources('');
      }

    } else {
      setLocalTrailersAvailable('');
      setLocalTrailerSources('');
    }
  }, [globalOEM, plannerDestZone, plannerOriginZone, globalPlant, globalYear, globalTimeframe, data, fleetData, getDestinationZone, getOriginZone, getMonthsForTimeframe]);

  // Calculations
  const capacity = Number(manualCapacity) || 0;
  const tripsPerMonth = Number(manualTrips) || 0;
  const localTrailers = Number(localTrailersAvailable) || 0;
  
  const totalTrips = capacity > 0 && carsToLift !== '' ? Math.ceil(Number(carsToLift) / capacity) : 0;
  const requiredTrailers = tripsPerMonth > 0 ? Math.ceil(totalTrips / tripsPerMonth) : 0;
  const remainingRequiredTrailers = Math.max(0, requiredTrailers - localTrailers);

  const zones = ['All', ...destZones];

  return (
    <div className="bg-[#F8FAFC] min-h-screen p-6 rounded-[12px] text-[#1E293B] font-sans border border-[#E2E8F0] shadow-sm">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-[#1E293B] flex items-center gap-3">
          <Truck className="text-[#005689]" size={32} />
          {transportName || 'Fleet Planner'}
        </h2>
        <p className="text-[#64748B] mt-2">Trailer & Trip Planning Module</p>
      </div>

      {/* Filters */}
      <div className="mb-8 bg-[#FFFFFF] p-4 rounded-[12px] shadow-sm border border-[#E2E8F0] flex flex-wrap gap-3 items-center">
        <FilterDropdown label="Origin Zone" value={plannerOriginZone} options={['All', ...plannerFilteredZones]} onChange={(v: any) => { setPlannerOriginZone(v); setPlannerOEM('All'); setPlannerPlant('All'); setPlannerBranch('All'); }} icon={MapIcon} defaultLabel="All" />
        <div className="w-px h-6 bg-[#E2E8F0] hidden sm:block"></div>
        <FilterDropdown label="OEM" value={plannerOEM} options={['All', ...plannerFilteredOEMs]} onChange={(v: any) => { setPlannerOEM(v); setPlannerPlant('All'); setPlannerBranch('All'); }} icon={Truck} defaultLabel="All" />
        <div className="w-px h-6 bg-[#E2E8F0] hidden sm:block"></div>
        <FilterDropdown label="Plant" value={plannerPlant} options={['All', ...plannerFilteredPlants]} onChange={(v: any) => { setPlannerPlant(v); setPlannerBranch('All'); }} icon={Factory} defaultLabel="All" />
        <div className="w-px h-6 bg-[#E2E8F0] hidden sm:block"></div>
        <FilterDropdown label="Branch" value={plannerBranch} options={['All', ...plannerFilteredBranches]} onChange={(v: any) => setPlannerBranch(v)} icon={Building} defaultLabel="All" />
      </div>

      {/* Selection Grid */}
      <div className="mb-10">
        <h3 className="text-xl font-semibold text-[#1E293B] mb-4 flex items-center gap-2">
          <MapIcon size={20} className="text-[#005689]" />
          Select Trailer Type
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {fleetData.map((trailer) => (
            <motion.button
              key={trailer.id}
              whileHover={{ scale: 1.02, boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)", y: -2 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedTrailerId(trailer.id)}
              className={`p-4 rounded-[12px] border text-left transition-all duration-300 ${
                selectedTrailerId === trailer.id
                  ? 'bg-[#FFFFFF] border-[#005689] shadow-md'
                  : 'bg-[#FFFFFF] border-[#E2E8F0] hover:border-[#005689]/50 shadow-sm'
              }`}
            >
              <div className="font-bold text-[#1E293B] mb-1">{trailer.name}</div>
              <div className="text-xs text-[#64748B] mb-3 line-clamp-2 h-8">{trailer.desc}</div>
              <div className="flex justify-between items-center text-sm">
                <label htmlFor={`trailer-count-${trailer.id}`} className="text-[#64748B] flex items-center gap-1 w-full"><Truck size={14} className="text-[#005689]"/> Trailer count:
                  <input
                    id={`trailer-count-${trailer.id}`}
                    type="number"
                    min="0"
                    value={trailer.total}
                    onChange={(e) => {
                      const newTotal = Number(e.target.value);
                      setFleetData(prev => prev.map(t => t.id === trailer.id ? { ...t, total: newTotal } : t));
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="ml-auto w-16 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px] px-2 py-1 text-[#1E293B] font-mono font-semibold focus:outline-none focus:border-[#005689] focus:ring-1 focus:ring-[#005689] transition-all text-right"
                  />
                </label>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Calculator Section */}
      <div className="mb-12 bg-[#FFFFFF] p-6 rounded-[12px] border border-[#E2E8F0] shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-[#005689]"></div>
        <h3 className="text-xl font-semibold text-[#1E293B] mb-6 flex items-center gap-2">
          <Calculator size={20} className="text-[#005689]" />
          Trip & Requirement Calculator
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end mb-6">
          <div>
            <label htmlFor="total-sob" className="block text-sm font-medium text-[#64748B] mb-2 flex items-center gap-1"><Truck size={14} className="text-[#005689]"/> Total SOB</label>
            <input
              id="total-sob"
              type="number"
              min="0"
              value={carsToLift}
              onChange={(e) => setCarsToLift(e.target.value ? Number(e.target.value) : '')}
              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-[12px] px-4 py-3 text-[#1E293B] focus:outline-none focus:border-[#005689] focus:ring-1 focus:ring-[#005689] transition-all font-mono text-lg"
              placeholder="e.g. 150"
            />
          </div>

          <div>
            <label htmlFor="available-local-trailers" className="block text-sm font-medium text-[#64748B] mb-2 flex items-center gap-1"><Truck size={14} className="text-[#005689]"/> Available Local Trailers</label>
            <input
              id="available-local-trailers"
              type="number"
              min="0"
              value={localTrailersAvailable}
              onChange={(e) => setLocalTrailersAvailable(e.target.value ? Number(e.target.value) : '')}
              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-[12px] px-4 py-3 text-[#1E293B] focus:outline-none focus:border-[#005689] focus:ring-1 focus:ring-[#005689] transition-all font-mono text-lg"
              placeholder="e.g. 12"
            />
            {localTrailerSources && (
              <p className="mt-2 text-xs text-[#005689]">
                Includes: {localTrailerSources}
              </p>
            )}
          </div>
          
          <div>
            <label htmlFor="trip-capacity" className="block text-sm font-medium text-[#64748B] mb-2 flex items-center gap-1"><Truck size={14} className="text-[#005689]"/> Capacity</label>
            <input
              id="trip-capacity"
              type="number"
              min="1"
              value={manualCapacity}
              onChange={(e) => setManualCapacity(e.target.value ? Number(e.target.value) : '')}
              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-[12px] px-4 py-3 text-[#1E293B] focus:outline-none focus:border-[#005689] focus:ring-1 focus:ring-[#005689] transition-all font-mono text-lg"
              placeholder="e.g. 8"
            />
          </div>

          <div>
            <label htmlFor="trips-per-month" className="block text-sm font-medium text-[#64748B] mb-2 flex items-center gap-1"><MapIcon size={14} className="text-[#005689]"/> Trips/Month</label>
            <input
              id="trips-per-month"
              type="number"
              min="1"
              value={manualTrips}
              onChange={(e) => setManualTrips(e.target.value ? Number(e.target.value) : '')}
              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-[12px] px-4 py-3 text-[#1E293B] focus:outline-none focus:border-[#005689] focus:ring-1 focus:ring-[#005689] transition-all font-mono text-lg"
              placeholder="e.g. 5"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[12px] p-4 flex flex-col justify-center items-center relative overflow-hidden group">
            <span className="text-xs font-medium text-[#64748B] uppercase tracking-wider mb-1 relative z-10">Total Required Trailers</span>
            <div className="relative group/tooltip">
              <motion.span 
                key={requiredTrailers}
                initial={{ scale: 1.1, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="text-4xl font-bold text-[#005689] font-mono relative z-10 cursor-help"
              >
                {requiredTrailers}
              </motion.span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs px-3 py-2 bg-[#1E293B] text-white text-xs rounded-md opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 shadow-lg text-center">
                Total trips needed / Trips per month per trailer
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1E293B]"></div>
              </div>
            </div>
          </div>

          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[12px] p-4 flex flex-col justify-center items-center relative overflow-hidden group opacity-80">
            <span className="text-xs font-medium text-[#64748B] uppercase tracking-wider mb-1 relative z-10">- Available Local Trailers</span>
            <div className="relative group/tooltip">
              <motion.span 
                key={localTrailers}
                initial={{ scale: 1.1, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="text-4xl font-bold text-[#10B981] font-mono relative z-10 cursor-help"
              >
                {localTrailers}
              </motion.span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs px-3 py-2 bg-[#1E293B] text-white text-xs rounded-md opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 shadow-lg text-center">
                The number of local trailers ready to be deployed
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1E293B]"></div>
              </div>
            </div>
          </div>

          <div className="bg-[#F8FAFC] border-[#005689]/20 border-2 rounded-[12px] p-4 flex flex-col justify-center items-center relative overflow-hidden group">
            <span className="text-xs font-medium text-[#005689] uppercase tracking-wider mb-1 relative z-10 font-bold">Remaining Trailers Required</span>
            <div className="relative group/tooltip">
              <motion.span 
                key={remainingRequiredTrailers}
                initial={{ scale: 1.1, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="text-4xl font-bold text-[#F59E0B] font-mono relative z-10 cursor-help"
              >
                {remainingRequiredTrailers}
              </motion.span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs px-3 py-2 bg-[#1E293B] text-white text-xs rounded-md opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 shadow-lg text-center">
                Total Required Trailers - Available Local Trailers
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1E293B]"></div>
              </div>
            </div>
          </div>
        </div>
        
        {carsToLift !== '' && capacity > 0 && tripsPerMonth > 0 && (
          <div className="mt-6 p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[12px] flex items-start gap-3 text-sm text-[#64748B]">
            <Info className="text-[#005689] shrink-0 mt-0.5" size={18} />
            <div>
              <p>
                To lift <strong className="text-[#1E293B]">{carsToLift}</strong> cars using {selectedTrailer ? <><strong className="text-[#1E293B]">{selectedTrailer.name}</strong> (Capacity: {capacity})</> : <>a capacity of <strong className="text-[#1E293B]">{capacity}</strong></>}, 
                you need <strong className="text-[#1E293B]">{totalTrips}</strong> total trips. 
                Since each trailer does <strong className="text-[#1E293B]">{tripsPerMonth}</strong> trips per month, 
                you require <strong className="text-[#005689] text-base">{requiredTrailers}</strong> trailers overall.
              </p>
              {localTrailers > 0 && (
                <p className="mt-2 text-[#F59E0B] font-medium">
                  After accounting for {localTrailers} available local trailers, you still require {remainingRequiredTrailers} more trailers.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Fleet Summary Table */}
      <div>
        <h3 className="text-xl font-semibold text-[#1E293B] mb-4 flex items-center gap-2">
          <Truck size={20} className="text-[#005689]" />
          Full Fleet Summary
        </h3>
        <div className="overflow-x-auto rounded-[12px] border border-[#E2E8F0] shadow-sm bg-[#FFFFFF]">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-[#1E293B] text-xs uppercase tracking-wider border-b border-[#E2E8F0]">
                <fleetSearch.FilterHeader title="Name" columnKey="name" />
                <fleetSearch.FilterHeader title="Function" columnKey="desc" />
                <th className="p-4 font-semibold text-center align-top mt-[26px] py-4 block">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {(() => {
                const filteredFleetList = fleetSearch.filterData(fleetData).filter(t => 
                  (plannerOriginZone === 'All' || t.zone === 'All' || t.zone === plannerOriginZone) && 
                  (globalPlant === 'All' || t.plant === 'All' || t.plant.toLowerCase().includes(globalPlant.toLowerCase()) || globalPlant.toLowerCase().includes(t.plant.toLowerCase()))
                );

                if (filteredFleetList.length === 0) {
                  return (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-[#64748B]">
                        No records found for the selected filters
                      </td>
                    </tr>
                  );
                }

                return (
                  <>
                  {filteredFleetList.map((trailer, idx) => (
                    <motion.tr 
                      key={trailer.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="hover:bg-[#F8FAFC] transition-colors"
                    >
                      <td className="p-4 text-sm font-medium text-[#1E293B]">
                        {trailer.name}
                      </td>
                      <td className="p-4 text-sm text-[#64748B]">
                        {trailer.desc}
                      </td>
                      <td className="p-4 text-sm font-bold text-[#005689] text-center font-mono">
                        <input
                          type="number"
                          min="0"
                          value={trailer.total}
                          onChange={(e) => {
                            const newTotal = Number(e.target.value);
                            setFleetData(prev => prev.map(t => t.id === trailer.id ? { ...t, total: newTotal } : t));
                          }}
                          className="w-20 mx-auto bg-transparent border border-transparent hover:border-[#E2E8F0] focus:bg-[#FFFFFF] focus:border-[#005689] focus:ring-1 focus:ring-[#005689] rounded-md px-2 py-1 text-center outline-none transition-all"
                        />
                      </td>
                    </motion.tr>
                  ))}
                  <tr className="bg-[#F8FAFC] border-t border-[#E2E8F0]">
                    <td colSpan={2} className="p-4 text-sm font-bold text-[#1E293B] text-right uppercase tracking-wider">
                      Grand Total
                    </td>
                    <td className="p-4 text-lg font-bold text-[#005689] text-center font-mono">
                      {filteredFleetList.reduce((sum, t) => sum + t.total, 0)}
                    </td>
                  </tr>
                  </>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
